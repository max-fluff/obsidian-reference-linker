// Branding config for Reference Linker — drives both the store plates and the vector
// headers. Run: npm run plates / npm run banner
// See src/shared/branding/BRANDING.md for the full field reference.

// The plugin's mark: a dog-eared sheet inside square brackets — the family's bracket form
// from Code Linker's [{}], holding a document instead of code. Same paths as icon.svg;
// the viewBox is their bounding box, stroke included, so the renderers scale it whole.
const MARK = {
  kind: 'svg',
  viewBox: '107 144 298 224',
  body: `<g fill="none" stroke="#fff" stroke-linejoin="round">
    <g stroke-width="24">
      <path d="M159 156H119v200h40"/>
      <path d="M353 156h40v200h-40"/>
    </g>
    <g stroke-width="26">
      <path d="M216 187h34l58 58v68a12 12 0 0 1-12 12h-80a12 12 0 0 1-12-12V199a12 12 0 0 1 12-12z"/>
      <path d="M250 187v46a12 12 0 0 0 12 12h46"/>
    </g>
  </g>`,
};

export default {
  imagesDir: 'docs/images',
  outDir: 'docs/images/store',

  brand: {
    gradient: ['#27243d', '#191826'],
    tokenColor: '#b6a6e8',
    tokenMono: true,
    // What the plugin indexes: document types, and the addresses inside them.
    tokens: [
      '.pdf', '#page=12', '.docx', 'p. 148', '.epub', '.xlsx', '§ 3.2',
      '.png', 'Chapter 7', '.pptx', '#page=3', '.jpg', 'Appendix B', '.djvu',
    ],
    mark: MARK,
    wordmark: { text: 'Reference Linker' },
    tagline: 'Autocomplete document references, jump to the exact page.',
  },

  // Screenshots aren't shot yet — fill in once the demo vault is captured, then npm run plates.
  plates: [],
};
