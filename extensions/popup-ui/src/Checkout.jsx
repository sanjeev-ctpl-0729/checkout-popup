import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useRef, useEffect} from 'preact/hooks';

export default async function init() {
  render(<Extension />, document.body);
}

function Extension() {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [totalWeight, setTotalWeight] = useState(0);
  const modalRef = useRef(null);
  
  // Get settings with fallback values
  const freightServiceFirst = shopify.settings.value.freight_services_first;
  const freightServiceSecond = shopify.settings.value.freight_services_second;
  const freightServiceThird = shopify.settings.value.freight_services_third;
  
  // Initialize with first option selected by default, only if valid
  const [merchandiseId, setMerchandiseId] = useState(
    freightServiceFirst ? `gid://shopify/ProductVariant/${freightServiceFirst}` : null
  );

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
    try {
      setError('');
      setAdding(true);

      // Validate merchandiseId before attempting to add
      if (!merchandiseId) {
        setError('Please select a freight service option.');
        setAdding(false);
        return;
      }

      // Get current cart lines
      const currentLines = shopify.lines.current;
      
      // Find all freight service variant IDs
      const freightVariantIds = [
        `gid://shopify/ProductVariant/${freightServiceFirst}`,
        `gid://shopify/ProductVariant/${freightServiceSecond}`,
        `gid://shopify/ProductVariant/${freightServiceThird}`
      ];

      // Find existing freight service items in cart
      const existingFreightLines = currentLines.filter(line => 
        freightVariantIds.includes(line.merchandise.id)
      );

      // Remove existing freight service items if any
      if (existingFreightLines.length > 0) {
        for (const line of existingFreightLines) {
          await shopify.applyCartLinesChange({
            type: 'removeCartLine',
            id: line.id,
            quantity: line.quantity,
          });
        }
      }

      // Add the selected freight service to cart
      const result = await shopify.applyCartLinesChange({
        type: 'addCartLine',
        merchandiseId: merchandiseId,
        quantity: 1,
      });

      if (result.type === 'error') {
        // Debug-style message; don't show raw to customers in production
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
  }


  // Only show freight shipping option if weight is above 100lb
  if (totalWeight <= 100) {
    return null;
  }

  // Don't render if freight services are not configured
  if (!freightServiceFirst || !freightServiceSecond || !freightServiceThird) {
    console.error('Freight services not configured in extension settings');
    return null;
  }

  return (
    <>
      {/* Button in checkout that opens the modal */}
      <s-button command="--show" commandFor="freight-modal" variant="primary">
        Freight shipping
      </s-button>

      {/* Modal content */}
      <s-modal id="freight-modal" heading="Freight shipping" ref={modalRef} size='large'>
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

          {/* Services single-select */}
          <s-heading>
            please select services required (all that apply).
          </s-heading>
          <s-text>
            Note: Residential locations need a lift gate unless equipped. Incorrect selections may lead to delays or additional fees.
          </s-text>

          <s-choice-list
            name="freightServices"
            onChange={(e) => {
              // e.currentTarget.values is an array, get first element for single selection
              const selectedValue = e.currentTarget.values[0];
              if (selectedValue) {
                setMerchandiseId(selectedValue);
              }
            }}
          >
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceFirst}`} selected>Residential - $80</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceSecond}`}>Lift Gate - $45</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceThird}`}>Delivery Appointment - $15</s-choice>
          </s-choice-list>

          {/* Special instructions */}
          <s-text>Special instructions</s-text>
          <s-text-area
            name="specialInstructions"
            label="Leave special instructions like business hours, business name etc to ensure a smooth delivery."
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