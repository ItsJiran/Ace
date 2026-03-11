import { z } from 'zod';

// ============================================================================
// CORE EVENT SYSTEM
// This file defines the global event bus schemas used across the entire ecosystem.
// ============================================================================

/**
 * Standard Supported Sub-Actions
 * These are the primary supported routing mechanisms out of the box.
 * Note: Widgets can extend and provide their own custom strings in the future,
 * but these form the core routing backbone.
 */
export const StandardSubActions = [
    'open_window',
    'open_tab',
    'open_widget',
    'send_window',
    'send_gateway',
    'send_terminal',
    'close_window',
    'close_tab',
    'run_shell',
    'read_file'
] as const;

// ----------------------------------------------------------------------
// 1. INTERACTION SCHEMA (Initiating Actions)
// How an entity (UI Widget, Gateway, OS) initiates an action or routes data.
// ----------------------------------------------------------------------

export const InteractionSchema = z.object({
    event_type: z.literal('interaction'),
    /** The globally unique instance ID of the window originating the event */
    window_uid: z.string(),
    /** The globally unique instance ID of the specific widget within the window */
    widget_uid: z.string().optional(),

    /** The core advanced routing terminology */
    action: z.enum(['lookup', 'open', 'send', 'close', 'execute_tool']),
    /** 
     * Explicit sub-routing detailing the exact mechanism.
     * Can be one of the StandardSubActions or a custom string defined by a widget.
     */
    sub_action: z.union([z.enum(StandardSubActions), z.string()]).optional(),

    /** The arbitrary payload data from the interaction or routing context */
    payload: z.record(z.string(), z.any()),
});

export type Interaction = z.infer<typeof InteractionSchema>;

// ----------------------------------------------------------------------
// 2. EVENT REACTION SCHEMA
// Defines what should be done when an event is listened to.
// ----------------------------------------------------------------------

export const EventReactionSchema = z.object({
    /** The specific behavior to execute when the event is received */
    reaction_type: z.enum([
        'forward_to_widget',   // Pass it directly to the React component's props/state
        'store_in_ram',        // Automatically dump the payload into Global RAM
        'trigger_tool',        // Automatically execute a local tool/script
        'emit_interaction',    // Immediately bounce back another interaction event
        'custom'               // Allow the widget's internal JS to decide
    ]),
    /** Optional specific identifier if the reaction needs further instructions */
    reaction_identifier: z.string().optional(),
});

export type EventReaction = z.infer<typeof EventReactionSchema>;

// ----------------------------------------------------------------------
// 3. LISTENER SCHEMA (Receiving Actions)
// How an entity reacts after receiving an external payload from another 
// service, gateway, or window.
// ----------------------------------------------------------------------

export const ListenerSchema = z.object({
    event_type: z.literal('listener'),

    /** The globally unique instance ID of the window receiving the payload. Optional for broadcasts. */
    target_window_uid: z.string().optional(),
    target_widget_uid: z.string().optional(),

    /** The specific event name or classification being listened to */
    listened_event: z.string(),

    /** The origin UID of the incoming payload (e.g. 'gateway', or a specific window_uid) */
    source_uid: z.string(),

    /** What to do now that this event has been received */
    reaction: EventReactionSchema,

    /** The external payload being received */
    payload: z.record(z.string(), z.any()),
});

export type Listener = z.infer<typeof ListenerSchema>;
