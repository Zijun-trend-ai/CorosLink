import { CalendarDays } from "lucide-react";
import type { TrainingHubUpcomingWorkout } from "../../../electron/types";
import {
  formatUpcomingWorkoutDate,
  formatUpcomingWorkoutLoad
} from "../formatters";

interface UpcomingWorkoutsPanelProps {
  workouts: TrainingHubUpcomingWorkout[];
}

export function UpcomingWorkoutsPanel({ workouts }: UpcomingWorkoutsPanelProps) {
  const countLabel = `${workouts.length} upcoming ${
    workouts.length === 1 ? "workout" : "workouts"
  }`;

  return (
    <section className="panel training-upcoming-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Training Calendar</p>
          <h2>Upcoming Workouts</h2>
        </div>
        <CalendarDays size={22} aria-hidden="true" />
      </div>

      {workouts.length === 0 ? (
        <div className="training-empty-state">
          <p>No scheduled workouts in the next two weeks.</p>
        </div>
      ) : (
        <>
          <p className="training-upcoming-meta">{countLabel}</p>
          <div className="table-shell training-upcoming-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Volume</th>
                  <th>Training Load</th>
                </tr>
              </thead>
              <tbody>
                {workouts.map((workout, index) => (
                  <tr
                    className="training-table-row"
                    key={`${workout.happenDay}-${workout.sortNo ?? index}-${workout.name}`}
                  >
                    <td>{formatUpcomingWorkoutDate(workout.happenDay)}</td>
                    <td>
                      <strong className="training-upcoming-name">
                        {workout.name}
                      </strong>
                    </td>
                    <td>{workout.volume ?? "--"}</td>
                    <td>{formatUpcomingWorkoutLoad(workout.trainingLoad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
