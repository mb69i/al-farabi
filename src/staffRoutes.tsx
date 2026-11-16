/** Staff-only screens, loaded on demand so the public page stays small. */
export default function StaffRoutes({ area }: { area: 'researchers' | 'admin' }) {
  return <p style={{ padding: 32 }}>{area}</p>;
}
