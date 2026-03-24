import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Checkout.jsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.shipping-option-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}
