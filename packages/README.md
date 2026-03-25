# ACE Package Ecosystem

This directory contains resources for developing external packages for ACE.

## Runtime AI Bridge Note

If your package interacts with AI sessions or emits AI-compatible structured blocks, follow the canonical mechanism in:

- `docs/GATEWAY_CONTEXT_MECHANISM.md`

This keeps package behavior aligned with parser and context-engine expectations.

## Architecture Overview

ACE uses a **Host-Guest Architecture**. 
- **Host**: The main ACE application (Tauri + React).
- **Guest**: Your package (bundled JS).

Your package does not ship its own React or Core Logic. instead, it consumes the global `window.ACE` API provided by the Host.

## How to Create a Package

1. **Initialize Project**:
   Create a standard TypeScript project using your favorite bundler (Vite configured for lib mode, tsup, or microbundle).

2. **Configure Bundler**:
   **CRITICAL**: You must exclude `react` and `react-dom` from your bundle. They are provided by ACE at runtime.

   *vite.config.ts example:*
   ```ts
   import { defineConfig } from 'vite';

   export default defineConfig({
     build: {
       lib: {
         entry: 'src/index.ts',
         name: 'MyPackage',
         fileName: 'index',
         formats: ['es']
       },
       rollupOptions: {
         external: ['react', 'react-dom'],
         output: {
           globals: {
             react: 'ACE.react',
             'react-dom': 'ACE.reactDOM'
           }
         }
       }
     }
   });
   ```

3. **Entry Point (`src/index.ts`)**:
   Register your capabilities using the global `window.ACE` bridge.

   ```ts
   // Declare global type if needed, or use provided type definitions
   const ACE = (window as any).ACE;

   const MyWidget = () => {
     const { useAceMemory } = ACE.memory;
     // ... implementation
     return ACE.react.createElement('div', {}, 'Hello World');
   };

   // Register to the system
   ACE.registry.add('my-package', 'widgets', [{
     name: 'My Widget',
     component: MyWidget
   }]);
   ```

4. **Entry Manifest (`src/entry.ts`)**:
   Declare package identity in code and register through `window.ACE.registry`.

   ```ts
   const ACE = (window as any).ACE;

   export const manifest = {
     namespace: 'my-org/my-package',
     package_name: 'my-org/my-package',
     version: '1.0.0',
     owner_scope: 'user',
     source_scope: 'local',
     display_name: 'My Package'
   };

   export default function bootstrap() {
     ACE.registry.registerPackage(manifest);
     ACE.registry.add(manifest.package_name, 'widgets', [{ widget_name: 'my_widget' }]);
   }
   ```

## Development Workflow

1. Build your package: `npm run build`
2. Run ACE in dev mode.
3. Use the `scripts/install-package.js` helper (or manually copy) to install your local package into the ACE config directory.

## Core API (`window.ACE`)

- **ACE.react**: The host's React instance.
- **ACE.reactDOM**: The host's ReactDOM instance.
- **ACE.memory**: Hooks and functions to interact with the Global RAM.
- **ACE.events**: Emit events to the system bus.
- **ACE.registry**: Register package manifest and domain entries (`registerPackage`, `registerPackageModules`, `add`).
