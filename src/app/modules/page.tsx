import type { Metadata } from "next";
import { ModuleLabRoot } from "@/components/modules/module-lab-root";

export const metadata: Metadata = {
  title: "Module Lab",
  robots: { index: false, follow: false },
};

export default function ModulesPage() {
  return <ModuleLabRoot />;
}
