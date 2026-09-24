import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { INK_HOME_URL, isInk } from "../../services/app-flavor.server";
import { loginErrorMessage } from "./error.server";

// Neither app's page ever asks for a shop domain (App Store requirement 2.3.1:
// install only from Shopify's own surfaces). With `?shop=` the library starts
// Shopify's install/OAuth as before; without one, the visitor goes to the
// app's own front door — ink's page under ink (whose button leads to the
// listing), the Ritualist's landing ("/") otherwise. The Ritualist asked for a
// shop domain here until 2026-09-24.
const frontDoor = () => (isInk() ? INK_HOME_URL : "/");

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!new URL(request.url).searchParams.get("shop")) throw redirect(frontDoor());
  const errors = loginErrorMessage(await login(request));
  // `login` throws Shopify's install redirect for any store it can name, and
  // returns only for a `?shop=` it cannot (install.in.ink/auth/login?shop=x*y
  // rendered the form below, 2026-09-24). Under ink that visitor goes to ink's
  // page too, so no address of ink's ever asks for a shop domain.
  if (isInk()) throw redirect(INK_HOME_URL);

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // The same door for a posted form: no shop domain is ever typed in.
  if (!new URL(request.url).searchParams.get("shop")) throw redirect(frontDoor());
  const errors = loginErrorMessage(await login(request));
  if (isInk()) throw redirect(INK_HOME_URL);

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
