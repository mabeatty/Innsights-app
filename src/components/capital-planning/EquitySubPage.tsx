import InvestorCapitalCallTracker from "./InvestorCapitalCallTracker";

interface Props {
  projectId: string;
  investorPositions: any[];
  reloadPositions: () => void;
}

export default function EquitySubPage({
  projectId, investorPositions, reloadPositions,
}: Props) {
  return (
    <div className="space-y-6 pt-2">
      <InvestorCapitalCallTracker
        projectId={projectId}
        positions={investorPositions}
        reload={reloadPositions}
      />
    </div>
  );
}
