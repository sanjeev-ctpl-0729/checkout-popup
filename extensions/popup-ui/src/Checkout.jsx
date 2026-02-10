import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useRef, useEffect} from 'preact/hooks';

export default async function init() {
  render(<Extension />, document.body);
}

function Extension() {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [merchandiseId, setMerchandiseId] = useState([]);
  const [totalWeight, setTotalWeight] = useState(0);
  const modalRef = useRef(null);

  // Subscribe to cart changes to get total weight
  useEffect(() => {
    const unsubscribe = shopify.lines.subscribe(async (lines) => {
      // Fetch weight data for all variants using Storefront API
      const variantIds = lines.map(line => line.merchandise.id);
      
      if (variantIds.length === 0) {
        setTotalWeight(0);
        return;
      }

      try {
        // Query Storefront API to get weight for each variant
        const query = `
          query getVariantWeights($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on ProductVariant {
                id
                weight
                weightUnit
              }
            }
          }
        `;

        const {data} = await shopify.query(query, {
          variables: {ids: variantIds},
        });

        // Calculate total weight
        let totalWeightInGrams = 0;
        lines.forEach((line, index) => {
          const variantData = data?.nodes?.[index];
          if (variantData && variantData.weight) {
            let weightInGrams = variantData.weight;
            
            // Convert to grams based on weight unit
            if (variantData.weightUnit === 'KILOGRAMS') {
              weightInGrams *= 1000;
            } else if (variantData.weightUnit === 'POUNDS') {
              weightInGrams *= 453.592;
            } else if (variantData.weightUnit === 'OUNCES') {
              weightInGrams *= 28.3495;
            }
            
            totalWeightInGrams += weightInGrams * line.quantity;
          }
        });

        // Convert grams to pounds
        const weightInPounds = totalWeightInGrams / 453.592;
        setTotalWeight(weightInPounds);
      } catch (error) {
        console.error('Error fetching variant weights:', error);
        setTotalWeight(0);
      }
    });

    return unsubscribe;
  }, []);

  async function handleSubmit() {
    merchandiseId.forEach(async (id) => {
      try {
        setError('');
        setAdding(true);

      // Variant to add – converted to a ProductVariant GID
      // const merchandiseId = 'gid://shopify/ProductVariant/49901166559478';

        const result = await shopify.applyCartLinesChange({
          type: 'addCartLine',
          merchandiseId: id,
          quantity: 1,
        });
  
        if (result.type === 'error') {
          // Debug-style message; don’t show raw to customers in production
          setError(result.message ?? 'Unable to add freight item.');
        } else {
          // Close the modal on success using the commands API:
          // trigger the close button that has commandFor="freight-modal"
          modalRef.current.hideOverlay();
        }
      } catch (e) {
        setError('Something went wrong while adding the freight item.');
      } finally {
        setAdding(false);
      }
    });
  }

  // Get settings with fallback values (use the original hardcoded IDs as defaults)
  const freightServiceFirst = shopify.settings.value.freight_services_first;
  const freightServiceSecond = shopify.settings.value.freight_services_second;
  const freightServiceThird = shopify.settings.value.freight_services_third;

  // Only show freight shipping option if weight is above 100lb
  if (totalWeight <= 100) {
    return null;
  }

  return (
    <>
      {/* Button in checkout that opens the modal */}
      <s-button command="--show" commandFor="freight-modal" variant="primary">
        Freight shipping
      </s-button>

      {/* Modal content */}
      <s-modal id="freight-modal" heading="Freight shipping" ref={modalRef}>
        <s-stack gap="base">
          <s-text>
            Due to your order&apos;s size, it will be palletized and shipped
            via freight.
          </s-text>

          <s-text>
            For more information, please refer to our FAQ -{' '}
            <s-link
              href="https://help.makesy.com/en_us/do-you-ship-freight-SkKoZBl69"
              target="_blank"
            >
              Freight Shipping
            </s-link>
            .
          </s-text>

          {/* Services multi-select */}
          <s-choice-list
            name="freightServices"
            label="Please select services required (all that apply)."
            multiple
            onChange={(e) => {
              // e.currentTarget.values is an array of strings
              setMerchandiseId(e.currentTarget.values);
            }}
          >
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceFirst}`}>Residential - $80</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceSecond}`}>Lift Gate - $45</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceThird}`}>Delivery Appointment - $15</s-choice>
          </s-choice-list>

          {/* Special instructions */}
          <s-text-area
            name="specialInstructions"
            label="Special instructions"
          />

          {/* Simple error message (optional) */}
          {error && <s-text>{error}</s-text>}

          {/* Submit adds variant 51895723000173 to the cart */}
          <s-button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={adding}
          >
            {adding ? 'Adding...' : 'Submit'}
          </s-button>
        </s-stack>
      </s-modal>
    </>
  );
}