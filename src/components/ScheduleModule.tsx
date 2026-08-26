import CriticalPathModule from "./schedule/CriticalPathModule";

interface Props {
  projectId: string;
  projectName?: string;
}

export default function ScheduleModule({ projectId, projectName }: Props) {
  return (
    <section className="space-y-4 pt-2 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Project Schedule
        </h2>
      </div>

      <CriticalPathModule projectId={projectId} />
    </section>
  );
}
