// This defines how the generic Window should physically behave when holding our component
export const MonitorWindowConfig = {
    title: "System Metrics",

    // We want the window to be semi-transparent and completely unclickable mostly, 
    // letting the user click through to their IDE unless they click our close button
    clickThrough: true,
    opacity: 0.8,

    // It should float in the top-right corner, non-resizable
    spawnCoordinates: { x: 'right: 20px', y: 'top: 20px' },
    resizable: false,

    // It should never appear in the taskbar or alt-tab
    hiddenFromOS: true,
};
