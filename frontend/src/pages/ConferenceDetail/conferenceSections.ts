import {
  InfoIcon,
  UsersIcon,
  ShareIcon,
  BookingIcon,
  SettingsGearIcon,
  SessionsIcon,
  SpeakerIcon,
  AttendeesIcon,
  PeopleIcon,
  SponsorsIcon,
  MapIcon,
  PaperIcon,
  ServiceProvidersIcon,
  InvoicesIcon,
  ProgramIcon,
  AnalyticsIcon,
  CfpTagIcon,
  CfpUsersGroupIcon,
  CfpInboxIcon,
  CfpDocumentTextIcon,
  CfpEvaluatedIcon,
  CfpThumbUpIcon,
  CfpThumbDownIcon,
  CfpAssignmentsIcon,
} from "./icons";

// ---------------------------------------------------------------------------
// Section navigation types
// ---------------------------------------------------------------------------

export type SectionId =
  | "details"
  | "team"
  | "social"
  | "booking"
  | "volunteers"
  | "locations"
  | "cfp"
  | "cfp-topics"
  | "cfp-program-committee"
  | "cfp-applicants"
  | "cfp-papers"
  | "cfp-assignments"
  | "cfp-evaluated-papers"
  | "cfp-accepted-papers"
  | "cfp-rejected-papers"
  | "sessions"
  | "speakers"
  | "attendees"
  | "sponsors"
  | "analytics"
  | "service_providers"
  | "program"
  | "invoices"
  | "settings";

export interface SectionChild {
  id: SectionId;
  name: string;
  icon: () => JSX.Element;
}

export interface SectionDef {
  id: SectionId;
  name: string;
  icon: () => JSX.Element;
  moduleCode?: string; // If set, only show when user has this module assigned
  children?: SectionChild[];
}

export const coreSections: SectionDef[] = [
  { id: "details", name: "Details", icon: InfoIcon },
  { id: "team", name: "Team", icon: UsersIcon },
  { id: "social", name: "Social Media", icon: ShareIcon },
  { id: "booking", name: "Booking Options", icon: BookingIcon },
  { id: "settings", name: "Settings", icon: SettingsGearIcon },
];

export const moduleSections: SectionDef[] = [
  {
    id: "sessions",
    name: "Sessions",
    icon: SessionsIcon,
    moduleCode: "sessions",
  },
  {
    id: "speakers",
    name: "Speakers",
    icon: SpeakerIcon,
    moduleCode: "speakers",
  },
  {
    id: "attendees",
    name: "Attendees",
    icon: AttendeesIcon,
    moduleCode: "attendees",
  },
  {
    id: "volunteers",
    name: "Volunteers",
    icon: PeopleIcon,
    moduleCode: "volunteers",
  },
  {
    id: "sponsors",
    name: "Sponsors",
    icon: SponsorsIcon,
    moduleCode: "sponsors",
  },
  {
    id: "locations",
    name: "Locations",
    icon: MapIcon,
    moduleCode: "locations",
  },
  {
    id: "cfp",
    name: "Call for Papers",
    icon: PaperIcon,
    moduleCode: "cfp",
    children: [
      { id: "cfp-topics", name: "Topics", icon: CfpTagIcon },
      {
        id: "cfp-program-committee",
        name: "Program Committee",
        icon: CfpUsersGroupIcon,
      },
      { id: "cfp-applicants", name: "Users", icon: CfpInboxIcon },
      { id: "cfp-papers", name: "Papers", icon: CfpDocumentTextIcon },
      {
        id: "cfp-assignments",
        name: "Assignments",
        icon: CfpAssignmentsIcon,
      },
      {
        id: "cfp-evaluated-papers",
        name: "Evaluated Papers",
        icon: CfpEvaluatedIcon,
      },
      {
        id: "cfp-accepted-papers",
        name: "Accepted Papers",
        icon: CfpThumbUpIcon,
      },
      {
        id: "cfp-rejected-papers",
        name: "Rejected Papers",
        icon: CfpThumbDownIcon,
      },
    ],
  },
  {
    id: "service_providers",
    name: "Service Providers",
    icon: ServiceProvidersIcon,
    moduleCode: "service_providers",
  },
  {
    id: "invoices",
    name: "Invoices",
    icon: InvoicesIcon,
    moduleCode: "invoices",
  },
  {
    id: "program",
    name: "Program",
    icon: ProgramIcon,
    moduleCode: "program",
  },
  {
    id: "analytics",
    name: "Analytics",
    icon: AnalyticsIcon,
    moduleCode: "analytics",
  },
];
