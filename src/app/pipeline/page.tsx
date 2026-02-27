import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  return (
    <div className="p-8">
      <PipelineClient />
    </div>
  );
}
