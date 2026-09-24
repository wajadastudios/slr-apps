/**
 * Shared width for the hero preview card (`AppPreviewCard`).
 */
export const APP_CARD_WIDTH_CLASS = "w-[88vw] max-w-[380px]";

/**
 * Width for the `#contoh-aplikasi` gallery's card deck (`AppGallery`) below
 * the `sm` breakpoint, where the deck is viewport-relative instead of the
 * desktop's fixed 320-350px: ~90% of the viewport, capped at the same
 * 320px the deck already uses at `sm`, so the card never grows past
 * desktop's own size as the viewport widens toward that breakpoint.
 */
export const APP_GALLERY_MOBILE_WIDTH_CLASS = "w-[90vw] max-w-[320px]";
