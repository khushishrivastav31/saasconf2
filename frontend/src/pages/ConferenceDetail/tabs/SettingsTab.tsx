import { useState } from "react";
import type { Conference } from "../../../types";
import ConferenceVolunteerRolesTab from "./settings/VolunteerRolesTab";
import ConferenceLocationTypesTab from "./settings/LocationTypesTab";
import ConferenceSponsorPackagesTab from "./settings/SponsorPackagesTab";
import ConferenceSessionTypesTab from "./settings/SessionTypesTab";
import ConferenceCommitteeRolesTab from "./settings/CommitteeRolesTab";
import ConferenceScoreScalesTab from "./settings/ScoreScalesTab";
import ConferenceReviewCriteriaTab from "./settings/ReviewCriteriaTab";
import PronounOptionsTab from "../../PronounOptionsTab";

type ConferenceSettingsActiveTab = "volunteer-roles" | "location-types" | "sponsor-packages" | "session-types" | "committee-roles" | "score-scales" | "review-criteria" | "pronoun-options";

function ConferenceSettingsTab({ conference, isAdmin }: { conference: Conference; isAdmin: boolean }) {
  const [activeTab, setActiveTab] =
    useState<ConferenceSettingsActiveTab>("volunteer-roles");

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Conference Settings
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage volunteer roles, location types, sponsor packages, session types, review configuration, and pronoun options for this conference
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("volunteer-roles")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "volunteer-roles"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Volunteer Roles
          </button>
          <button
            onClick={() => setActiveTab("location-types")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "location-types"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Location Types
          </button>
          <button
            onClick={() => setActiveTab("sponsor-packages")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "sponsor-packages"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Sponsor Packages
          </button>
          <button
            onClick={() => setActiveTab("session-types")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "session-types"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Session Types
          </button>
          <button
            onClick={() => setActiveTab("committee-roles")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "committee-roles"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Committee Roles
          </button>
          <button
            onClick={() => setActiveTab("score-scales")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "score-scales"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Score Scales
          </button>
          <button
            onClick={() => setActiveTab("review-criteria")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "review-criteria"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Review Criteria
          </button>
          <button
            onClick={() => setActiveTab("pronoun-options")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "pronoun-options"
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Pronoun Options
          </button>
        </nav>
      </div>

      {activeTab === "volunteer-roles" ? (
        <ConferenceVolunteerRolesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "location-types" ? (
        <ConferenceLocationTypesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "sponsor-packages" ? (
        <ConferenceSponsorPackagesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "session-types" ? (
        <ConferenceSessionTypesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "committee-roles" ? (
        <ConferenceCommitteeRolesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "score-scales" ? (
        <ConferenceScoreScalesTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "review-criteria" ? (
        <ConferenceReviewCriteriaTab conference={conference} isAdmin={isAdmin} />
      ) : activeTab === "pronoun-options" ? (
        <PronounOptionsTab conference={conference} isAdmin={isAdmin} />
      ) : null}
    </div>
  );
}

export default ConferenceSettingsTab;
