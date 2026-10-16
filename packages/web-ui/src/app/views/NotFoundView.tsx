/** The not-found view; an unmatched path resolves here rather than guessing. */
import { Compass } from "lucide-react";
import { overviewPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { Button, EmptyState } from "../ui/index.js";

export function NotFoundView() {
  const { basePath } = useRouter();
  return (
    <EmptyState
      icon={<Compass size={28} />}
      title="Not found"
      description="Nothing is registered at this path."
      action={
        <Button asChild>
          <Link to={overviewPath(basePath)}>Back to overview</Link>
        </Button>
      }
    />
  );
}
