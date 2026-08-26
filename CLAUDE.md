# Driver Application

Technology: React Native.

Primary users: Delivery drivers.

Responsibilities:

- View assigned deliveries.
- Access delivery addresses and contact information.
- Confirm pickup.
- Confirm delivery.
- Return unsuccessful deliveries.
- Mark payment as collected.
- Share location during active deliveries.

Prioritize:

- Minimal taps.
- Clear delivery actions.
- Reliable handling of poor connectivity.
- Removal of customer information when delivery access ends.

Before modifying API requests:

- Inspect the corresponding endpoint in ../drugstore-server.
- Confirm the admin dashboard displays the updated state correctly.

Live updates:

- The queue refreshes itself. `RealtimeProvider` holds a WebSocket while the
  driver is signed in and the app is foregrounded, and `useQueue` keeps polling
  as the fallback the server's docs/realtime.md requires. Do not remove the
  poll.
- A socket frame carries no patient data — only that something changed. React
  by invalidating the queue query; never render a frame.
