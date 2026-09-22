import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import firestore from "../firestore.server";
import { SESSION_COLLECTION } from "../firestore-session-storage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`📦 Received ${topic} webhook for ${shop}`);

  if (session && payload?.current) {
    const current = payload.current as string[];
    await firestore.collection(SESSION_COLLECTION).doc(session.id).update({
      scope: current.toString(),
    });
  }

  return new Response();
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
