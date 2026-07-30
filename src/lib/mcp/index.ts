import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import listProjectMilestones from "./tools/list-project-milestones";
import logProjectHours from "./tools/log-project-hours";
import listMyProjectHours from "./tools/list-my-project-hours";
import listMyAttendance from "./tools/list-my-attendance";
import projectHoursSummary from "./tools/project-hours-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "project-compass",
  title: "Project Compass",
  version: "0.1.0",
  instructions:
    "Tools for the Simona Architects time & project management system. Use list_projects to find a project, log_project_hours to record work, list_my_project_hours and list_my_attendance for the signed-in employee's own records, project_hours_summary for totals per project, and list_project_milestones for payment stages (managers only). All access is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listProjects,
    listProjectMilestones,
    logProjectHours,
    listMyProjectHours,
    listMyAttendance,
    projectHoursSummary,
  ],
});
