import { Redirect } from 'expo-router';

/**
 * The real entry point is the queue, which arrives with the session and queue
 * work. Until then the design gallery is what there is to look at.
 */
export default function Index() {
  return <Redirect href="/design" />;
}
