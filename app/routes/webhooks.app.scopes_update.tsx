import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        await firestore.collection("shopify_sessions").doc(session.id).update({
            scope: current.toString(),
        });
    }
    return new Response();
};
