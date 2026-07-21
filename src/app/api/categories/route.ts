import { listCategories } from "@/lib/queries";
import { withAuth } from "@/lib/route";

export const GET = withAuth(async () => Response.json(listCategories()));
