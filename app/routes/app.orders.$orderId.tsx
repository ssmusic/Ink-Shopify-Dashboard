import { useEffect, useState } from "react";
import { data } from "react-router";
import {
    useLoaderData,
    useActionData,
    useNavigate,
    useRouteError,
    useFetcher,
} from "react-router";
import type {
    LoaderFunctionArgs,
    ActionFunctionArgs,
    HeadersFunction,
} from "react-router";
import { authenticate } from "../shopify.server";
import { openRecordFromProof, openRowsFromTapEvents, locationLine } from "../services/order-open-record";
import type { OpenRow } from "../services/order-open-record";
import TapOpensList from "../components/TapOpensList";
import VerifiableRecordCard from "../components/VerifiableRecordCard";
import { RITUALIST_BILLING_PATH, RITUALIST_PLAN_SENTENCE } from "../lib/record-handover";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Thumbnail,
    Button,
    Banner,
    InlineStack,
    Badge,
    Divider,
    Modal,
    Link,
} from "@shopify/polaris";
import {
    getStagedUploadTarget,
    registerUploadedFile,
} from "../utils/shopify-files.server";
import PolarisAppLayout from "../components/PolarisAppLayout";
import TapLocationCard from "../components/TapLocationCard";
import { Copy } from "lucide-react";
import { FEATURE_NFC } from "../flags";

// Local interface for Proof since we define the structure locally
interface Proof {
    order_id: string;
    enrollment_status: string | null;
    nfc_uid: string | null;
    nfs_proof_id: string | null;
    nfc_token: string | null;
    photo_hashes: string | null;
    delivery_gps: string | null;
    shipping_address_gps: string | null;
    proof_id: string;

    // Alan's API verification response fields
    verification_status: string | null;
    verify_url: string | null;
    verification_updated_at: Date | null;
    distance_meters: number | null;
    gps_verdict: string | null;
}

// Helper: Format Date
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
    });
};

// Helper: Format GPS
const formatGPS = (gpsString: string | null) => {
    if (!gpsString) return null;
    try {
        // Handle both JSON format {"lat":...,"lng":...} and simple "lat,lng" string
        let lat, lng;
        if (gpsString.startsWith("{")) {
            const parsed = JSON.parse(gpsString);
            lat = parsed.lat;
            lng = parsed.lng;
        } else {
            [lat, lng] = gpsString.split(",");
        }

        if (!lat || !lng) return { text: gpsString, url: null };

        return {
            text: `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`,
            url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        };
    } catch (e) {
        return { text: gpsString, url: null };
    }
};

// Helper: Client-side Image Compression
const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
        const maxWidth = 1280;
        const maxHeight = 1280;
        const quality = 0.7;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error("Compression failed"));
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg",
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    "image/jpeg",
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

interface Product {
    title: string;
    quantity: number;
    price: string;
    sku: string;
    image: string | null;
}

interface OrderDetail {
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    totalPrice: string;
    currency: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress:
    | {
        address1: string;
        address2: string;
        city: string;
        province: string;
        zip: string;
        country: string;
    }
    | null;
    products: Product[];
    metafields: {
        verification_status?: string;
        nfc_uid?: string;
        proof_reference?: string;
        photos_hashes?: string;
        delivery_gps?: string;
        photo_urls?: string;
    };
    localProof?: {
        verification_status: string | null;
        verify_url: string | null;
        verification_updated_at: string | null;
        distance_meters: number | null;
        gps_verdict: string | null;
        photo_urls: string[] | null;
        tap_count: number;
        last_tap_at: string | null;
        opens: OpenRow[];
        // The verifiable record (the audit machine): the public verify link,
        // its QR, and whether ink has published a chained record yet.
        proof_id: string;
        verify_record_url: string;
        verify_record_qr: string;
        record_published: boolean;
        /** Priced and not bought: the proof is behind the purchase. */
        record_locked: boolean;
        /** The audit door spoke of a price at all (locked, or bought). */
        record_priced: boolean;
    } | null;
}

type LoaderData = {
    order: OrderDetail | null;
    error: string | null;
    /** THE RECORD'S DOOR for this order (services/record-charges.server.ts). */
    recordNeedsPlan?: boolean;
};

type ActionData = {
    success: boolean;
    message: string | null;
    fileUrl?: string;
    photoIndex?: number;
};

// ===== LOADER =====
export const loader = async ({
    request,
    params,
}: LoaderFunctionArgs): Promise<LoaderData> => {
    const { admin, session } = await authenticate.admin(request);
    const { orderId } = params;

    if (!orderId) {
        return { order: null, error: "Order ID is required" };
    }

    const query = `#graphql
    query GetOrderDetail($id: ID!) {
      order(id: $id) {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          firstName
          lastName
          email
          phone
        }
        shippingAddress {
          address1
          address2
          city
          province
          zip
          country
        }
        lineItems(first: 10) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
              sku
              image {
                url
              }
            }
          }
        }
        metafields(namespace: "ink", first: 10) {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }`;

    try {
        const response = await admin.graphql(query, {
            variables: { id: `gid://shopify/Order/${orderId}` },
        });
        const result = await response.json();

        if (!result.data?.order) {
            return { order: null, error: "Order not found" };
        }

        const orderData = result.data.order;

        // Extract metafields from Shopify
        const metafields: OrderDetail["metafields"] = {};
        orderData.metafields.edges.forEach((edge: any) => {
            metafields[edge.node.key as keyof OrderDetail["metafields"]] =
                edge.node.value;
        });

        // Get proof_id from metafields (stored during enrollment)
        const proofId = metafields.proof_reference;
        console.log(`🔍 Order Details Loader: Order ${orderId}, Proof ID from metafields: ${proofId || "none"}`);

        // The order's proof, read with the merchant's own key. This used to
        // call the proof door with no key at all and get 401 on every order —
        // measured 2026-09-19 — so nothing below ever rendered. The key is the
        // one resolveBrandPageUrl already needs; the per-open rows are asked
        // for only once the merchant-keyed read has returned this proof.
        let alanProofData: {
            verification_status: string | null;
            verify_url: string | null;
            verification_updated_at: string | null;
            distance_meters: number | null;
            gps_verdict: string | null;
            enrollment_status: string | null;
            nfc_uid: string | null;
            delivery_gps: string | null;
            photo_urls: string[] | null;
            tap_count: number;
            last_tap_at: string | null;
            opens: OpenRow[];
            proof_id: string;
            verify_record_url: string;
            verify_record_qr: string;
            record_published: boolean;
            record_locked: boolean;
            record_priced: boolean;
        } | null = null;

        if (proofId) {
            try {
                const { getProof, getTapEvents } = await import("../services/ink-api.server");
                const { resolveBrandPageUrl } = await import("../services/brand-page-url.server");
                const { findMerchantDoc } = await import("../services/merchant-doc.server");
                const firestore = (await import("../firestore.server")).default;
                const merchantHit = await findMerchantDoc(firestore, session.shop);
                const merchantApiKey: string | null = merchantHit?.data?.ink_api_key ?? null;

                const proof = merchantApiKey ? await getProof(merchantApiKey, proofId) : null;
                if (proof) {
                    const record = openRecordFromProof(proof);
                    const opens = openRowsFromTapEvents(await getTapEvents(proofId));

                    // THE BUYER'S PAGE, from the one author of that address
                    // (brand-page-url.server.ts): {brand}.in.ink/r/{nfc_token},
                    // null unless the proof carries a real token.
                    const resolvedPage = await resolveBrandPageUrl({
                        merchantApiKey,
                        proofId,
                        shop: session.shop,
                        merchantData: merchantHit?.data ?? {},
                        label: "order-detail",
                    });

                    // Where the first open happened, when that open shared it.
                    const firstOpen = opens.find((o) => o.first) ?? null;

                    // The verifiable record: published once ink holds a chained
                    // event for this order (the audit door answers with one).
                    // Best-effort — an order page never fails on it.
                    const { publicVerifyUrl, verifyQrSrc } = await import("../services/verify-url.server");
                    const { getProofAudit } = await import("../services/ink-api.server");
                    const { handoverLocked } = await import("../lib/record-handover");
                    let recordPublished = false;
                    let recordLocked = false;
                    let recordPriced = false;
                    try {
                        // merchantApiKey is non-null here: getProof returned a proof.
                        const audit = await getProofAudit(merchantApiKey as string, proofId);
                        // A priced record whose hand-over is not bought: the
                        // merchant door answers it whole (ink-backend #129) —
                        // or, before that, its words and no chain (#124). Either
                        // way it is published, and its hand-over (the PDF, the
                        // export, the link's proof) is locked.
                        recordLocked = !!audit && handoverLocked(audit.record);
                        recordPriced = !!audit && !!audit.record;
                        recordPublished = recordLocked || (!!audit && Array.isArray(audit.chain) && audit.chain.length > 0);
                    } catch (auditErr: any) {
                        console.warn("[order-detail] audit door unavailable:", auditErr?.message ?? auditErr);
                    }

                    alanProofData = {
                        ...record,
                        verify_url: resolvedPage.pageUrl,
                        enrollment_status: "enrolled",
                        nfc_uid: proof.nfc_uid || null,
                        delivery_gps: firstOpen?.coords ? JSON.stringify(firstOpen.coords) : null,
                        opens,
                        proof_id: proofId,
                        verify_record_url: publicVerifyUrl(proofId),
                        verify_record_qr: verifyQrSrc(proofId),
                        record_published: recordPublished,
                        record_locked: recordLocked,
                        record_priced: recordPriced,
                    };
                } else {
                    console.warn(`[order-detail] no proof read for ${proofId} (${merchantApiKey ? "not found for this shop" : "merchant has no ink key"})`);
                }
            } catch (alanError: any) {
                console.error(`⚠️ Failed to fetch proof from ink:`, alanError.message);
                // Continue without proof data - don't fail the whole page
            }
        }

        // Determine normalized display status
        let displayStatus = "Pending";
        if (alanProofData?.verification_status === "verified") {
            displayStatus = "Active";
        } else if (alanProofData?.enrollment_status === "enrolled" || metafields.verification_status === "enrolled") {
            displayStatus = "Enrolled";
        }

        metafields.verification_status = displayStatus;

        // Use data from Alan's API if available, otherwise fall back to metafields
        if (alanProofData) {
            metafields.nfc_uid = metafields.nfc_uid || alanProofData.nfc_uid || undefined;
            metafields.delivery_gps = alanProofData.delivery_gps || metafields.delivery_gps;
            // warehouse_gps rode along from the old unauthenticated read (a
            // legacy NFC-enroll field the proof projection does not carry);
            // the FEATURE_NFC block below still reads it off metafields.
        }

        // Extract products
        const products: Product[] = orderData.lineItems.edges.map((edge: any) => ({
            title: edge.node.title,
            quantity: edge.node.quantity,
            price: edge.node.originalUnitPriceSet.shopMoney.amount,
            sku: edge.node.sku || "N/A",
            image: edge.node.image?.url || null,
        }));

        const order: OrderDetail = {
            id: orderId,
            name: orderData.name,
            createdAt: orderData.createdAt,
            financialStatus: orderData.displayFinancialStatus,
            fulfillmentStatus: orderData.displayFulfillmentStatus,
            totalPrice: orderData.totalPriceSet.shopMoney.amount,
            currency: orderData.totalPriceSet.shopMoney.currencyCode,
            customerName: orderData.customer
                ? `${orderData.customer.firstName} ${orderData.customer.lastName}`
                : "Guest",
            customerEmail: orderData.customer?.email || "",
            customerPhone: orderData.customer?.phone || "",
            shippingAddress: orderData.shippingAddress || null,
            products,
            metafields,
            // Use Alan's API data for localProof (renamed but same structure)
            localProof: alanProofData ? {
                verification_status: alanProofData.verification_status,
                verify_url: alanProofData.verify_url,
                verification_updated_at: alanProofData.verification_updated_at,
                distance_meters: alanProofData.distance_meters,
                gps_verdict: alanProofData.gps_verdict,
                photo_urls: alanProofData.photo_urls,
                tap_count: alanProofData.tap_count,
                last_tap_at: alanProofData.last_tap_at,
                opens: alanProofData.opens,
                proof_id: alanProofData.proof_id,
                verify_record_url: alanProofData.verify_record_url,
                verify_record_qr: alanProofData.verify_record_qr,
                record_published: alanProofData.record_published,
                record_locked: alanProofData.record_locked,
                record_priced: alanProofData.record_priced,
            } : null,
        };

        // THE RECORD ON THE RITUALIST (Sam, 2026-09-24; ink-backend #154):
        // this page is mounted only in the Ritualist, which never sells the
        // record and never names ink's price. A record the backend prices
        // means the store has no active Ritualist plan: the card says the plan
        // includes it and links to Billing (VerifiableRecordCard hides the PDF
        // and the export, which would answer 402).
        const recordNeedsPlan = !!(order.localProof?.proof_id && order.localProof.record_locked);

        return { order, error: null, recordNeedsPlan };
    } catch (error) {
        console.error("Loader error:", error);
        return { order: null, error: "Failed to load order" };
    }
};

// ===== ACTION =====
export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { orderId } = params;

    try {
        const { admin } = await authenticate.admin(request);

        if (!orderId) {
            return data<ActionData>({
                success: false,
                message: "Order ID is required",
            });
        }

        const formData = await request.formData();
        const file = formData.get("photo") as any;
        const gpsData = (formData.get("gps") as string) || "";
        const photoIndexRaw = formData.get("photoIndex") as string | null;
        const photoIndex =
            photoIndexRaw != null ? Number(photoIndexRaw) : undefined;

        if (!file) {
            return data<ActionData>({
                success: false,
                message: "No file uploaded",
                photoIndex,
            });
        }

        const filename = (file as any).name || "upload.jpg";
        const mimeType = (file as any).type || "image/jpeg";
        const fileSize =
            typeof (file as any).size === "number"
                ? String((file as any).size)
                : "0";

        // 1. Get staged upload target from Shopify
        const target = await getStagedUploadTarget(admin, {
            filename,
            mimeType,
            resource: "IMAGE",
            fileSize,
        });

        // 2. Upload binary to the staged URL (server-side)
        const uploadFormData = new FormData();
        target.parameters.forEach((p: any) =>
            uploadFormData.append(p.name, p.value)
        );
        uploadFormData.append("file", file);

        const uploadResponse = await fetch(target.url, {
            method: "POST",
            body: uploadFormData,
        });

        if (!uploadResponse.ok) {
            console.error("Staged upload failed:", await uploadResponse.text());
            return data<ActionData>({
                success: false,
                message: "Failed to upload file to storage",
                photoIndex,
            });
        }

        // 3. Register the file in Shopify Files API
        let fileUrl = "";
        try {
            const registered = await registerUploadedFile(admin, target.resourceUrl);
            // URL might be null/undefined while the file is still processing.
            // That's OK – registration itself succeeded if no error was thrown.
            fileUrl = registered?.url || "";
        } catch (e: any) {
            console.error("registerUploadedFile error:", e);
            return data<ActionData>({
                success: false,
                message:
                    e?.message || "Failed to register uploaded file with Shopify Files",
                photoIndex,
            });
        }

        // 4. Update metafields (delivery_gps) ONLY IF we actually have GPS data
        if (gpsData) {
            const metafieldsSet = [
                {
                    namespace: "ink",
                    key: "delivery_gps",
                    value: gpsData,
                    type: "single_line_text_field",
                },
            ];

            const mfResponse = await admin.graphql(
                `#graphql
          mutation metaobjectUpsert($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors {
                field
                message
              }
            }
          }`,
                {
                    variables: {
                        metafields: metafieldsSet.map((m) => ({
                            ...m,
                            ownerId: `gid://shopify/Order/${orderId}`,
                        })),
                    },
                }
            );

            const mfJson = await mfResponse.json();
            const errors = mfJson?.data?.metafieldsSet?.userErrors || [];
            if (errors.length) {
                console.error("Metafields errors:", errors);
                return data<ActionData>({
                    success: false,
                    message: errors.map((e: any) => e.message).join(", "),
                    photoIndex,
                });
            }
        }

        // If no GPS data, we just skip metafieldsSet and still treat upload as success
        return data<ActionData>({
            success: true,
            message: "File uploaded successfully",
            fileUrl,
            photoIndex,
        });
    } catch (error: any) {
        console.error("Upload error:", error);
        return data<ActionData>({
            success: false,
            message: error.message || "Upload failed",
        });
    }
};

export default function OrderDetails() {
    const { order, error, recordNeedsPlan } = useLoaderData() as LoaderData;
    const actionData = useActionData() as ActionData | undefined;
    const navigate = useNavigate();

    // Per-photo UI state
    const [photos, setPhotos] = useState<(File | null)[]>([
        null,
        null,
        null,
        null,
    ]);
    const [photoPreviews, setPhotoPreviews] = useState<(string | null)[]>([
        null,
        null,
        null,
        null,
    ]);
    const [uploadStatus, setUploadStatus] = useState<
        ("idle" | "uploading" | "success" | "error")[]
    >(["idle", "idle", "idle", "idle"]);
    const [uploadProgress, setUploadProgress] = useState<number[]>([
        0, 0, 0, 0,
    ]);
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
    const [selectedTab, setSelectedTab] = useState(0);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // Single fetcher used for upload; server returns ActionData
    const uploadFetcher = useFetcher<ActionData>();

    // React to server action completion
    useEffect(() => {
        if (uploadFetcher.state === "idle" && uploadFetcher.data) {
            const { success, message, photoIndex } = uploadFetcher.data;

            if (typeof photoIndex === "number") {
                const idx = photoIndex;
                setUploadingIndex(null);

                setUploadProgress((prev) => {
                    const next = [...prev];
                    next[idx] = success ? 100 : 0;
                    return next;
                });

                setUploadStatus((prev) => {
                    const next = [...prev];
                    next[idx] = success ? "success" : "error";
                    return next;
                });

                if (!success && message) {
                    alert(`❌ ${message}`);
                }
            }
        }
    }, [uploadFetcher.state, uploadFetcher.data]);

    if (error || !order) {
        return (
            <Page>
                <Banner tone="critical">{error || "Order not found"}</Banner>
            </Page>
        );
    }

    const handleFileSelect = (index: number, file: File | null) => {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image file");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("File size must be less than 5MB");
            return;
        }

        const newPhotos = [...photos];
        newPhotos[index] = file;
        setPhotos(newPhotos);

        const reader = new FileReader();
        reader.onloadend = () => {
            const newPreviews = [...photoPreviews];
            newPreviews[index] = reader.result as string;
            setPhotoPreviews(newPreviews);
        };
        reader.readAsDataURL(file);
    };

    const handleRemovePhoto = (index: number) => {
        const newPhotos = [...photos];
        newPhotos[index] = null;
        setPhotos(newPhotos);

        const newPreviews = [...photoPreviews];
        newPreviews[index] = null;
        setPhotoPreviews(newPreviews);

        const newStatus = [...uploadStatus];
        newStatus[index] = "idle";
        setUploadStatus(newStatus);

        const newProgress = [...uploadProgress];
        newProgress[index] = 0;
        setUploadProgress(newProgress);
    };

    const handleUploadPhoto = async (index: number) => {
        const originalPhoto = photos[index];
        if (!originalPhoto) return;

        setUploadingIndex(index);
        setUploadStatus((prev) => {
            const next = [...prev];
            next[index] = "uploading";
            return next;
        });
        setUploadProgress((prev) => {
            const next = [...prev];
            next[index] = 10; // initial
            return next;
        });

        // Compress the image
        let photo: File;
        try {
            photo = await compressImage(originalPhoto);
            console.log(`Compressed: ${originalPhoto.size} -> ${photo.size}`);
        } catch (e) {
            console.error("Compression failed, using original", e);
            photo = originalPhoto;
        }

        // 0. Get GPS (client-side)
        let gpsString = "";
        try {
            const pos = await new Promise<GeolocationPosition>(
                (resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                    });
                }
            );
            gpsString = `${pos.coords.latitude},${pos.coords.longitude}`;
        } catch (e) {
            console.warn("GPS failed:", e);
        }

        setUploadProgress((prev) => {
            const next = [...prev];
            next[index] = 30;
            return next;
        });

        // 1. Submit via React Router fetcher to the route action
        const formData = new FormData();
        formData.append("photo", photo);
        formData.append("gps", gpsString);
        formData.append("photoIndex", index.toString());

        uploadFetcher.submit(formData, {
            method: "post",
            encType: "multipart/form-data",
        });

        setUploadProgress((prev) => {
            const next = [...prev];
            next[index] = 60;
            return next;
        });
    };

    const handleRetryUpload = (index: number) => {
        handleUploadPhoto(index);
    };

    const badgeTone = (status: string) => {
        switch (status) {
            case "PAID":
                return "success";
            case "PENDING":
                return "warning";
            case "FULFILLED":
                return "success";
            case "UNFULFILLED":
                return "attention";
            default:
                return "info";
        }
    };

    // Determine if order is verified
    const isVerified = order.metafields.verification_status?.toLowerCase() === "verified";
    const isEnrolled = order.metafields.verification_status?.toLowerCase() === "enrolled";

    const eventTabs = [
        { id: "record", content: "Record" },
        { id: "tap", content: "Open" },
    ];

    const verificationStatusRaw = order.metafields.verification_status?.toLowerCase() || "pending";
    // No status is ever drawn green: the loader never passes "verified" through
    // (it becomes "Active" above), and no word here may read as a pass.
    const statusBadgeTone = (s: string) => {
        if (s === "enrolled") return "warning" as const;
        if (s === "active") return "info" as const;
        return undefined;
    };
    const statusLabel = verificationStatusRaw.charAt(0).toUpperCase() + verificationStatusRaw.slice(1);

    const hasTapData = verificationStatusRaw === "verified" || (order.localProof?.tap_count ?? 0) > 0;
    const locationWords = locationLine(order.localProof?.gps_verdict, order.localProof?.distance_meters);

    // Parse delivery GPS
    const deliveryGps = order.metafields.delivery_gps;
    let deliveryCoords: { lat: number; lng: number } | undefined;
    if (deliveryGps) {
        try {
            if (deliveryGps.startsWith("{")) {
                const parsed = JSON.parse(deliveryGps);
                deliveryCoords = { lat: parsed.lat, lng: parsed.lng };
            } else {
                const parts = deliveryGps.split(",").map((s: string) => parseFloat(s.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    deliveryCoords = { lat: parts[0], lng: parts[1] };
                }
            }
        } catch {}
    }

    const fullAddress = order.shippingAddress
        ? `${order.shippingAddress.address1}, ${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.zip}`
        : "";
    const addressLabel = order.shippingAddress
        ? `${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.zip}`
        : "";

    // Photo sources: prefer localProof.photo_urls, fall back to existing previews
    const serverPhotos: (string | null)[] = order.localProof?.photo_urls
        ? [...order.localProof.photo_urls, null, null, null, null].slice(0, 4)
        : [null, null, null, null];
    const displayPhotos = photoPreviews.map((p, i) => p || serverPhotos[i]);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).catch(() => {});
    };

    const fmt = (n: number | string, currency = order.currency) =>
        parseFloat(String(n)).toLocaleString("en-US", { style: "currency", currency });

    const subtotal = order.products.reduce(
        (sum, p) => sum + parseFloat(p.price) * p.quantity,
        0
    );

    return (
        <PolarisAppLayout>
            <Page
                title={order.name}
                titleMetadata={
                    <Badge tone={statusBadgeTone(verificationStatusRaw)}>{statusLabel}</Badge>
                }
                subtitle={formatDate(order.createdAt)}
                backAction={{ content: "Orders", onAction: () => navigate("/app/tagged-shipments") }}
                // The buyer's page, offered where a merchant is already looking
                // at the order. It was resolved in the loader and then rendered
                // nowhere — a typed field nobody shows is invisible to tsc, to
                // the suite, and to review. `external` keeps it a real anchor:
                // it leaves the embedded app for {brand}.in.ink.
                secondaryActions={
                    order.localProof?.verify_url
                        ? [{
                            content: "Open the buyer's page",
                            url: order.localProof.verify_url,
                            external: true,
                        }]
                        : undefined
                }
            >
                <Layout>
                    {/* Left Column: Customer + Products */}
                    <Layout.Section variant="oneThird">
                        <BlockStack gap="400">
                            {/* Customer */}
                            <Card>
                                <BlockStack gap="300">
                                    <Text as="h3" variant="headingSm">Customer</Text>
                                    <Text as="p" variant="bodyMd" fontWeight="medium">{order.customerName}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">{order.customerEmail}</Text>
                                    <Divider />
                                    {order.shippingAddress ? (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            {order.shippingAddress.address1}<br />
                                            {order.shippingAddress.address2 && <>{order.shippingAddress.address2}<br /></>}
                                            {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.zip}<br />
                                            {order.shippingAddress.country}
                                        </Text>
                                    ) : (
                                        <Text as="p" variant="bodySm" tone="subdued">No shipping address available</Text>
                                    )}
                                </BlockStack>
                            </Card>

                            {/* Products */}
                            <Card>
                                <BlockStack gap="300">
                                    <Text as="h3" variant="headingSm">Products</Text>
                                    {order.products.map((product, idx) => (
                                        <InlineStack key={idx} align="space-between" blockAlign="start">
                                            <BlockStack gap="0">
                                                <Text as="p" variant="bodySm" fontWeight="medium">{product.title}</Text>
                                                <Text as="p" variant="bodySm" tone="subdued">{product.sku} × {product.quantity}</Text>
                                            </BlockStack>
                                            <Text as="p" variant="bodySm" fontWeight="medium">
                                                {fmt(parseFloat(product.price) * product.quantity)}
                                            </Text>
                                        </InlineStack>
                                    ))}
                                    <Divider />
                                    <InlineStack align="space-between">
                                        <Text as="span" tone="subdued" variant="bodySm">Subtotal</Text>
                                        <Text as="span" variant="bodySm">{fmt(subtotal)}</Text>
                                    </InlineStack>
                                    <InlineStack align="space-between">
                                        <Text as="span" tone="subdued" variant="bodySm">Shipping</Text>
                                        <Text as="span" variant="bodySm">Free</Text>
                                    </InlineStack>
                                    <Divider />
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodySm" fontWeight="semibold">Total</Text>
                                        <Text as="span" variant="bodySm" fontWeight="semibold">
                                            {fmt(order.totalPrice)}
                                        </Text>
                                    </InlineStack>
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    </Layout.Section>

                    {/* Right Column: Events (Write / Tap) */}
                    <Layout.Section>
                        <div style={{ border: "1px solid var(--p-color-border)", borderRadius: "0" }}>
                            {/* Folder-style tabs */}
                            <div style={{
                                display: "flex",
                                alignItems: "flex-end",
                                background: "var(--p-color-bg-surface-secondary)",
                                padding: "0 16px",
                            }}>
                                <div style={{ display: "flex", gap: "0", alignItems: "flex-end", paddingTop: "8px" }}>
                                    {eventTabs.map((tab, i) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setSelectedTab(i)}
                                            style={{
                                                padding: "8px 16px",
                                                fontSize: "13px",
                                                fontWeight: 500,
                                                cursor: "pointer",
                                                border: "1px solid var(--p-color-border)",
                                                borderBottom: selectedTab === i ? "1px solid var(--p-color-bg-surface)" : "1px solid var(--p-color-border)",
                                                background: selectedTab === i ? "var(--p-color-bg-surface)" : "transparent",
                                                color: selectedTab === i ? "var(--p-color-text)" : "var(--p-color-text-secondary)",
                                                marginBottom: "-1px",
                                                borderRadius: "0",
                                                position: "relative",
                                                zIndex: selectedTab === i ? 2 : 1,
                                            }}
                                        >
                                            {tab.content}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div style={{ borderTop: "1px solid var(--p-color-border)" }} />

                            {/* Tab content */}
                            <div style={{ padding: "16px", background: "var(--p-color-bg-surface)" }}>
                                {/* Record Tab */}
                                {selectedTab === 0 && (
                                    <BlockStack gap="400">
                                        {/* Record ID; NFC metadata stays hidden with the hardware lane. */}
                                        <InlineStack gap="400" wrap={false}>
                                            {FEATURE_NFC && <div style={{ flex: 1, background: "var(--p-color-bg-surface-secondary)", padding: "12px", borderRadius: "8px" }}>
                                                <Text as="p" tone="subdued" variant="bodySm">Tag UID</Text>
                                                <Text as="p" variant="bodySm" fontWeight="medium">
                                                    <code style={{ fontFamily: "monospace" }}>{order.metafields.nfc_uid || "—"}</code>
                                                </Text>
                                            </div>}
                                            <div style={{ flex: 1, background: "var(--p-color-bg-surface-secondary)", padding: "12px", borderRadius: "8px" }}>
                                                <Text as="p" tone="subdued" variant="bodySm">Record ID</Text>
                                                <InlineStack gap="200" blockAlign="center">
                                                    <Text as="p" variant="bodySm" fontWeight="medium">
                                                        <code style={{ fontFamily: "monospace" }}>{order.metafields.proof_reference || "—"}</code>
                                                    </Text>
                                                    {order.metafields.proof_reference && (
                                                        <button
                                                            onClick={() => copyToClipboard(order.metafields.proof_reference!, "Record ID")}
                                                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                                                            aria-label="Copy Record ID"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                    )}
                                                </InlineStack>
                                            </div>
                                        </InlineStack>

                                        {/* Warehouse GPS */}
                                        {FEATURE_NFC && (order.metafields as any).warehouse_gps && (
                                            <div style={{ background: "var(--p-color-bg-surface-secondary)", padding: "16px", borderRadius: "8px" }}>
                                                <Text as="p" tone="subdued" variant="bodySm">Warehouse GPS</Text>
                                                <Text as="p" variant="bodySm" fontWeight="medium">
                                                    <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{(order.metafields as any).warehouse_gps}</code>
                                                </Text>
                                            </div>
                                        )}

                                        {/* Package Photos */}
                                        <BlockStack gap="200">
                                            <Text as="p" tone="subdued" variant="bodySm">Package Photos</Text>
                                            <InlineStack gap="300">
                                                {displayPhotos.map((photo, i) => (
                                                    <div key={i} style={{ position: "relative" }}>
                                                        {photo ? (
                                                            <button
                                                                onClick={() => setLightboxImage(photo)}
                                                                style={{ border: "1px solid var(--p-color-border)", borderRadius: "4px", overflow: "hidden", cursor: "pointer", background: "none", padding: 0 }}
                                                            >
                                                                <Thumbnail source={photo} alt={`Package photo ${i + 1}`} size="large" />
                                                            </button>
                                                        ) : (
                                                            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", border: "2px dashed var(--p-color-border)", borderRadius: "4px", cursor: "pointer", background: "var(--p-color-bg-surface-secondary)" }}>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    style={{ display: "none" }}
                                                                    onChange={(e) => handleFileSelect(i, e.target.files?.[0] || null)}
                                                                />
                                                                <Text as="p" variant="bodySm" tone="subdued">+</Text>
                                                            </label>
                                                        )}
                                                        {photoPreviews[i] && uploadStatus[i] === "idle" && (
                                                            <div style={{ marginTop: "4px" }}>
                                                                <Button size="slim" onClick={() => handleUploadPhoto(i)}>
                                                                    Upload
                                                                </Button>
                                                            </div>
                                                        )}
                                                        {uploadingIndex === i && (
                                                            <div style={{ marginTop: "4px" }}>
                                                                <Button size="slim" loading disabled>
                                                                    Uploading...
                                                                </Button>
                                                            </div>
                                                        )}
                                                        {uploadStatus[i] === "success" && (
                                                            <Text as="p" variant="bodySm" tone="success">✓</Text>
                                                        )}
                                                        {uploadStatus[i] === "error" && (
                                                            <Button size="slim" onClick={() => handleRetryUpload(i)}>Retry</Button>
                                                        )}
                                                    </div>
                                                ))}
                                            </InlineStack>
                                        </BlockStack>
                                    </BlockStack>
                                )}

                                {/* Tap Tab */}
                                {selectedTab === 1 && (
                                    <>
                                        {hasTapData ? (
                                            <InlineStack gap="800" wrap={false} blockAlign="start">
                                                {/* Timeline */}
                                                <div style={{ flex: 1 }}>
                                                    <BlockStack gap="400">
                                                        <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Timeline</Text>
                                                        <BlockStack gap="300">
                                                            {order.localProof?.verification_updated_at && (
                                                                <InlineStack gap="300" blockAlign="start">
                                                                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--p-color-text)", marginTop: "4px", flexShrink: 0 }} />
                                                                    <BlockStack gap="100">
                                                                        <Text as="p" variant="bodySm" fontWeight="medium">Opened</Text>
                                                                        <Text as="p" tone="subdued" variant="bodySm">{order.localProof.verification_updated_at}</Text>
                                                                    </BlockStack>
                                                                </InlineStack>
                                                            )}
                                                            {locationWords && (
                                                                <InlineStack gap="300" blockAlign="start">
                                                                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--p-color-text)", marginTop: "4px", flexShrink: 0 }} />
                                                                    <BlockStack gap="100">
                                                                        <Text as="p" variant="bodySm" fontWeight="medium">Location</Text>
                                                                        <Text as="p" tone="subdued" variant="bodySm">
                                                                            {locationWords}
                                                                        </Text>
                                                                        {deliveryCoords && (
                                                                            <Text as="p" tone="subdued" variant="bodySm">
                                                                                <code style={{ fontFamily: "monospace", fontSize: "12px" }}>
                                                                                    {deliveryCoords.lat.toFixed(4)}, {deliveryCoords.lng.toFixed(4)}
                                                                                </code>
                                                                            </Text>
                                                                        )}
                                                                    </BlockStack>
                                                                </InlineStack>
                                                            )}
                                                            {/* A fixed "Confirmation sent — Delivery record sent to
                                                                {email}" step stood here on every opened order, whether
                                                                or not any email went out: this page reads no send. */}
                                                        </BlockStack>
                                                    </BlockStack>
                                                </div>
                                                {/* Every open, newest first */}
                                                {(order.localProof?.opens?.length ?? 0) > 0 && (
                                                    <div style={{ flex: 1 }}>
                                                        <TapOpensList opens={order.localProof!.opens} />
                                                    </div>
                                                )}
                                                {/* Map */}
                                                {deliveryCoords && (
                                                    <div style={{ flex: 1 }}>
                                                        <BlockStack gap="200">
                                                            <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">Open location</Text>
                                                            <TapLocationCard
                                                                lat={deliveryCoords.lat}
                                                                lng={deliveryCoords.lng}
                                                                address={addressLabel}
                                                                fullAddress={fullAddress}
                                                                distanceFromAddress={locationWords ?? undefined}
                                                            />
                                                        </BlockStack>
                                                    </div>
                                                )}
                                            </InlineStack>
                                        ) : (
                                            <BlockStack gap="200" inlineAlign="center">
                                                <Text as="p" variant="bodySm" fontWeight="medium" tone="subdued">No open recorded yet</Text>
                                                <Text as="p" variant="bodySm" tone="subdued">Waiting for the customer to open their order page</Text>
                                            </BlockStack>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        {/* The verifiable record — the public link, its QR, the
                            printed audit report, the export (the audit machine). */}
                        {order.localProof?.proof_id && (
                            <div style={{ marginTop: "16px" }}>
                                <VerifiableRecordCard
                                    proofId={order.localProof.proof_id}
                                    verifyUrl={order.localProof.verify_record_url}
                                    qrSrc={order.localProof.verify_record_qr}
                                    recordExportHref={`/app/api/orders/${encodeURIComponent(order.id)}/record-export?proof=${encodeURIComponent(order.localProof.proof_id)}`}
                                    published={order.localProof.record_published}
                                    locked={order.localProof.record_locked}
                                >
                                    {recordNeedsPlan && (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            {RITUALIST_PLAN_SENTENCE} <Link url={RITUALIST_BILLING_PATH}>Billing</Link>
                                        </Text>
                                    )}
                                </VerifiableRecordCard>
                            </div>
                        )}
                    </Layout.Section>
                </Layout>
            </Page>

            {/* Lightbox */}
            <Modal
                open={!!lightboxImage}
                onClose={() => setLightboxImage(null)}
                title="Package Photo"
            >
                <Modal.Section>
                    {lightboxImage && (
                        <img
                            src={lightboxImage}
                            alt="Package photo"
                            style={{ width: "100%", maxHeight: "80vh", objectFit: "contain" }}
                        />
                    )}
                </Modal.Section>
            </Modal>
        </PolarisAppLayout>
    );
}


export function ErrorBoundary() {
    const error = useRouteError();
    console.error("[OrderDetails] ErrorBoundary caught error:", error);
    return boundary.error(error);
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
