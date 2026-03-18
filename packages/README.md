# ACE Package Ecosystem

This directory contains resources for developing external packages for ACE.

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

4. **Manifest (`registry.json`)**:
   Create a `registry.json` in your root.
   
   ```json
   {
     "package_name": "my-package",
     "entry_point": "dist/index.js",
     "owner_scope": "user",
     "description": "My awesome plugin"
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
- **ACE.registry**: Register components, tools, and widgets.
