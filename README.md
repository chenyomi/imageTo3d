# React + TypeScript + Vite

## API Routing (Current)

- Web app: `src/services/modelApi.ts` resolves URL in this order:
  - `VITE_GRADIO_URL`
  - Gist dynamic instance list (`VITE_GIST_ID`)
- Mini program: `miniprogram/services/gradio.js` uses the same strategy:
  - Gist dynamic URL first
  - fixed `hf.space` URL fallback
- Worker proxy fallback has been removed from both clients.

### Build-time env vars

- `VITE_GRADIO_URL`: optional fixed Gradio endpoint
- `VITE_GIST_ID`: optional Gist ID for dynamic instance list

## Mini Program Preview Compatibility

Current mini program preview can only render GLB files that do not require unsupported texture extensions in WeChat xr-frame.

Verified generated GLB samples from the current Pixal3D service all contain:

- required extension: `EXT_texture_webp`
- image mime types: `image/webp`

This is why the web app can display the model while the mini program preview stays blank or falls back to an incompatibility message.

### Root Cause

The upstream Pixal3D service hard-codes WebP texture export in `extract_glb_api`.

Relevant upstream repository and call sites:

- `TencentARC/Pixal3D`
- `app.py`: `glb.export(out_glb, extension_webp=True)`
- `inference.py`: `glb.export(output_path, extension_webp=True)`
- `data_toolkit/visualize_pbr_latent.py`: `glb.export(glb_path, extension_webp=True)`

### Required Fix

If mini program in-app preview is required, the service must export GLB without WebP texture extension.

Change the upstream export call from:

```python
glb.export(out_glb, extension_webp=True)
```

to:

```python
glb.export(out_glb, extension_webp=False)
```

The same change should be applied to the other Pixal3D export call sites listed above.

### What Cannot Fix It

The current frontend and mini program clients cannot solve this by changing request parameters alone.

Current `extract_glb_api` only exposes:

- `state_path`
- `decimation_target`
- `texture_size`
- `session_id`

There is no public parameter for texture format selection.

### Temporary Behavior In This Repo

- web app: still works because browser-side loaders support the generated GLB
- mini program: now detects incompatible GLB files and shows a clear incompatibility message instead of an endless blank preview

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
