# UI Design Style Guide

The visual language of this application aims for a highly modern, sleek, and minimalist aesthetic. While it aims for the premium, polished feel of top-tier productivity tools, it maintains its own distinct identity.

## 🎨 Core Aesthetic Philosophy

- **Premium & Minimalist**: The UI should feel like a high-end tool. This means generous whitespace, crisp typography, and an absence of visual clutter.
- **Glassmorphism & Depth**: Strategic use of blur (`backdrop-filter`) and subtle shadows to create depth, especially important since the app acts as an overlay on top of other windows.
- **Dark Mode Bias**: The primary design language defaults to a dark, sleek tech aesthetic, utilizing deep grays and blacks (e.g., zinc or slate scales from Tailwind) rather than stark blacks.
- **Subtle Micro-interactions**: Buttons and interactive elements should have smooth, quick transitions (e.g., a slight scale-down on click, soft background fades on hover) without feeling sluggish.

## 🔲 Dual-Mode Containers

Every major UI component (like the Prompt Bar, an Obsidian Note Widget, or a Calendar Card) must be designed to support **two distinct display modes**.

### 1. Transparent Mode (The "Ambient" Default)
When the user is not directly interacting with a specific widget, or when the app is in its default resting state, containers should fade into the background.
- **Backgrounds**: Highly transparent (e.g., `bg-black/20` or even completely transparent).
- **Borders**: Very subtle, perhaps a 1px border with low opacity (`border-white/10`).
- **Foreground Elements**: Text and icons might be slightly dimmed to avoid distracting the user from their underlying OS tasks.
- **Purpose**: To allow the assistant to remain on screen without becoming an obstacle.

### 2. Solid/Focus Mode (The "Active" State)
When the user hovers over a widget, clicks into an input field, or when the AI demands immediate attention (e.g., an urgent reminder), the container shifts into Focus Mode.
- **Backgrounds**: Solid or near-solid colors (e.g., `bg-zinc-900` or a heavy glassmorphic blur).
- **Borders**: More defined borders or subtle glows to indicate it is the active window.
- **Foreground Elements**: Text becomes fully opaque; input cursors become active.
- **Transitions**: The shift from Transparent to Solid must be animated smoothly (e.g., using Tailwind's `transition-all duration-200 ease-in-out`).

## 🖋️ Typography & Colors

- **Font**: San Francisco (on Mac), Inter, or a similar clean sans-serif. Monospace fonts (like JetBrains Mono or Geist Mono) should be used strictly for code snippets or specific tool outputs.
- **Accents**: Rely on a single, vibrant accent color (e.g., a specific shade of indigo, glowing green, or clean white) to highlight active states, primary buttons, or important AI insights. Avoid a rainbow of colors.

## 🧱 Component Implementation (Tailwind approach)

When building components in React, we will utilize utility classes to handle these dual states.
For example, a generic widget container might look like this:

```jsx
<div className={`
  /* Base styles */
  rounded-xl transition-all duration-300 border
  
  /* Transparent Mode (Default) */
  bg-black/10 border-white/5 backdrop-blur-sm
  
  /* Focus Mode (On Hover or Active) */
  hover:bg-zinc-950 hover:border-zinc-800 hover:backdrop-blur-md hover:shadow-2xl
`}>
  {/* Content */}
</div>
```

This strict adherence to Dual-Mode containers ensures the overlay can be both an invisible background helper and a powerful, focused command center when needed.
