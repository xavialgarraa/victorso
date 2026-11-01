import {adminQuery} from '~/lib/shopifyAdmin.server';

type CustomerLookup = {
  customers: {nodes: Array<{id: string; emailMarketingConsent: {marketingState: string} | null}>};
};

type CustomerMutationResult = {
  customer: {id: string} | null;
  userErrors: Array<{field: string[] | null; message: string}>;
};

/** Suscribe un email a la newsletter (marketing de Shopify, gestionada
 * desde Shopify Email) — no crea una cuenta de cliente con contraseña, solo
 * marca el consentimiento de marketing. Si el email ya existe como cliente
 * (de una compra anterior, por ejemplo), lo actualiza en vez de duplicarlo. */
export async function subscribeToNewsletter(env: Env, email: string): Promise<void> {
  const lookup = await adminQuery<CustomerLookup>(
    env,
    `query FindCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        nodes { id emailMarketingConsent { marketingState } }
      }
    }`,
    {query: `email:${email}`},
  );

  const existing = lookup.customers.nodes[0];

  if (existing) {
    if (existing.emailMarketingConsent?.marketingState === 'SUBSCRIBED') {
      return; // ya suscrito, nada que hacer
    }
    const result = await adminQuery<{customerUpdate: CustomerMutationResult}>(
      env,
      `mutation SubscribeExistingCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
      {
        input: {
          id: existing.id,
          emailMarketingConsent: {marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN'},
        },
      },
    );
    if (result.customerUpdate.userErrors.length > 0) {
      throw new Error(result.customerUpdate.userErrors.map((e) => e.message).join(', '));
    }
    return;
  }

  const result = await adminQuery<{customerCreate: CustomerMutationResult}>(
    env,
    `mutation CreateNewsletterCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email,
        emailMarketingConsent: {marketingState: 'SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN'},
      },
    },
  );
  if (result.customerCreate.userErrors.length > 0) {
    throw new Error(result.customerCreate.userErrors.map((e) => e.message).join(', '));
  }
}
