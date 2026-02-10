import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useRef} from 'preact/hooks';

export default async function init() {
  render(<Extension />, document.body);
}

function Extension() {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [merchandiseId, setMerchandiseId] = useState([]);
  const modalRef = useRef(null);

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