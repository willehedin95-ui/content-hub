import GrowthEngine from "@/components/pulse/GrowthEngine";
import DeliveryEngine from "@/components/pulse/DeliveryEngine";
import SupportEngine from "@/components/pulse/SupportEngine";

export const dynamic = "force-dynamic";

export default function PulsePage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Pulse</h1>
        <p className="text-sm text-gray-500 mt-1">
          30-sekunders hälsokoll — Growth, Delivery, Support
        </p>
      </div>
      <GrowthEngine />
      <DeliveryEngine />
      <SupportEngine />
    </div>
  );
}
