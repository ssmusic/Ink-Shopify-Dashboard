import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { INK_HOME_URL, isInk } from "../../services/app-flavor.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Under ink this page never asks for a shop domain (App Store requirement
  // 2.3.1: install only from Shopify's own surfaces). With `?shop=` the
  // library starts Shopify's install/OAuth as before; without one, the
  // visitor goes to ink's own page, whose button leads to the listing.
  if (isInk() && !new URL(request.url).searchParams.get("shop")) throw redirect(INK_HOME_URL);
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // The same door for a posted form: under ink no shop domain is ever typed in.
  if (isInk() && !new URL(request.url).searchParams.get("shop")) throw redirect(INK_HOME_URL);
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
        <s-section heading="Log in">
          <s-text-field
            name="shop"
            label="Shop domain"
            details="example.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autocomplete="on"
            error={errors.shop}
          ></s-text-field>
          <s-button type="submit">Log in</s-button>
        </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
