import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useRef, useEffect} from 'preact/hooks';
import {useBuyerJourneyIntercept} from '@shopify/ui-extensions/checkout/preact';

export default async function init() {
  render(<Extension />, document.body);
}

function Extension() {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [totalWeight, setTotalWeight] = useState(0);
  const modalRef = useRef(null);
  const [attributes, setAttributes] = useState('');
  // Get settings with fallback values
  const freightServiceFirstTitle = shopify.settings.value.freight_services_first_title;
  const freightServiceSecondTitle = shopify.settings.value.freight_services_second_title;
  const freightServiceThirdTitle = shopify.settings.value.freight_services_third_title;
  
  // Get settings with fallback values
  const freightServiceFirst = shopify.settings.value.freight_services_first;
  const freightServiceSecond = shopify.settings.value.freight_services_second;
  const freightServiceThird = shopify.settings.value.freight_services_third;

  const freightWeight = shopify.settings.value.freight_services_weight_limit;

  // Get freight variant IDs
  const freightVariantIds = [
    `gid://shopify/ProductVariant/${freightServiceFirst}`,
    `gid://shopify/ProductVariant/${freightServiceSecond}`,
    `gid://shopify/ProductVariant/${freightServiceThird}`
  ];
  
  // Initialize with empty array for multi-select
  const [selectedMerchandiseIds, setSelectedMerchandiseIds] = useState([]);

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

      // Check if "None" option is selected
      const hasNoneOption = selectedMerchandiseIds.includes('none');
      
      // Get current cart lines
      const currentLines = shopify.lines.current;

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

      // If "None" is selected, don't add any freight services
      if (hasNoneOption) {
        // Close the modal on success
        modalRef.current.hideOverlay();
        return;
      }

      // Validate that at least one freight service is selected (if not "None")
      if (!selectedMerchandiseIds || selectedMerchandiseIds.length === 0) {
        setError('Please select at least one freight service option.');
        setAdding(false);
        return;
      }

      // Add all selected freight services to cart (excluding "none")
      const freightServicesToAdd = selectedMerchandiseIds.filter(id => id !== 'none');
      for (const merchandiseId of freightServicesToAdd) {
        const result = await shopify.applyCartLinesChange({
          type: 'addCartLine',
          merchandiseId: merchandiseId,
          quantity: 1,
          attributes: []
        });

        if (result.type === 'error') {
          setError(result.message ?? 'Unable to add freight item.');
          setAdding(false);
          return;
        }
      }

      // Add special instructions as cart note if provided
      if (attributes && attributes.trim()) {
        await shopify.applyNoteChange({
          type: 'updateNote',
          note: `Freight Special Instructions: ${attributes}`
        });
      }

      // Close the modal on success
      modalRef.current.hideOverlay();
    } catch (e) {
      setError('Something went wrong while adding the freight items.');
    } finally {
      setAdding(false);
    }
  }


  // Only show freight shipping option if weight is above 100lb
  if (totalWeight <= Number(freightWeight)) {
    return null;
  }

  // Don't render if freight services are not configured
  if (!freightServiceFirst || !freightServiceSecond || !freightServiceThird) {
    console.error('Freight services not configured in extension settings');
    return null;
  }

  // Check if freight item is already in cart
  const currentLines = shopify.lines.current;
  const hasFreightItem = currentLines.some(line => 
    freightVariantIds.includes(line.merchandise.id)
  );

  // Check if user has made a freight selection (either 'none' or freight services)
  const hasMadeFreightSelection = selectedMerchandiseIds.length > 0;

  // Check if 'none' is selected
  const hasSelectedNone = selectedMerchandiseIds.includes('none');

  // Checkout validation - block if no freight item in cart when weight > limit
  useBuyerJourneyIntercept(({canBlockProgress}) => {
    const currentLines = shopify.lines.current;
    
    // Check if weight exceeds limit
    if (totalWeight <= Number(freightWeight)) {
      return { behavior: 'allow' };
    }

    // Check if any freight item is in cart
    const hasFreightItem = currentLines.some(line => 
      freightVariantIds.includes(line.merchandise.id)
    );

    // Check if user has made a selection (either 'none' or freight services)
    const hasMadeSelection = selectedMerchandiseIds.length > 0;

    // Block if no freight item added AND no selection made
    if (canBlockProgress && !hasFreightItem && !hasMadeSelection) {
      return {
        behavior: 'block',
        reason: 'Freight service required',
        errors: [{
          message: 'Please add a freight service option before completing checkout.',
        }],
      };
    }

    return { behavior: 'allow' };
  });

  return (
    <>
      {/* Warning banner when no freight selection made and no freight item in cart */}
      {!hasFreightItem && !hasMadeFreightSelection && (
        <s-banner>
          <s-text>
            ⚠️ Checkout Blocked: You must select a freight service option before completing checkout.
          </s-text>
        </s-banner>
      )}

      {/* Success banner when freight item is added or when 'none' is selected */}
      {(hasFreightItem || hasSelectedNone) && (
        <s-banner>
          <s-text>
            ✅ {hasFreightItem ? 'Freight service added. You may now complete your order.' : 'Freight service declined. You may now complete your order.'}
          </s-text>
        </s-banner>
      )}

      {/* Button in checkout that opens the modal */}
      <s-button command="--show" commandFor="freight-modal" variant="primary">
        {hasFreightItem ? 'Modify Freight Shipping' : 'Add Freight Shipping (Required)'}
      </s-button>

      {/* Modal content */}
      <s-modal id="freight-modal" heading="freight shipping." ref={modalRef} size='large'>
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
            multiple
            onChange={(e) => {
              // e.currentTarget.values is an array containing all selected values
              const selectedValues = e.currentTarget.values || [];
              setSelectedMerchandiseIds(selectedValues);
            }}
          >
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceFirst}`}>{freightServiceFirstTitle}</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceSecond}`}>{freightServiceSecondTitle}</s-choice>
            <s-choice value={`gid://shopify/ProductVariant/${freightServiceThird}`}>{freightServiceThirdTitle}</s-choice>
            <s-choice value="none">None</s-choice>
          </s-choice-list>

          {/* Special instructions */}
          <s-text>special instructions</s-text>
          <s-text-area
            name="specialInstructions"
            label="Leave special instructions like business hours, business name etc to ensure a smooth delivery."
            onChange={(e) => {
              setAttributes(e.currentTarget.value);
            }}
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
            {adding ? 'Adding...' : 'submit'}
          </s-button>
        </s-stack>
      </s-modal>
    </>
  );
}