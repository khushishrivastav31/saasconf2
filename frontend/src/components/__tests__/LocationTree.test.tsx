import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LocationTree from "../LocationTree";
import type { Location, Conference, TenantLocationType } from "../../types";

const mockTypeMap: Record<string, TenantLocationType> = {
  room: {
    id: "1",
    tenant_id: "tenant-1",
    conference_id: "conf-1",
    name: "Room",
    slug: "room",
    description: null,
    is_active: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    usage_count: 0,
  },
  hall: {
    id: "2",
    tenant_id: "tenant-1",
    conference_id: "conf-1",
    name: "Hall",
    slug: "hall",
    description: null,
    is_active: true,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    usage_count: 0,
  },
};

const createLocation = (overrides: Partial<Location> = {}): Location => ({
  id: "loc-1",
  tenant_id: "tenant-1",
  parent_id: null,
  name: "Test Location",
  code: "TL",
  location_type: "room",
  description: null,
  capacity: 100,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  full_address: null,
  latitude: null,
  longitude: null,
  building: null,
  floor: null,
  phone: null,
  website: null,
  vat_number: null,
  amenities: [],
  accessibility_features: [],
  virtual_url: null,
  virtual_platform: null,
  is_active: true,
  settings: {},
  contact_persons: [],
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  children_count: 0,
  conference_ids: ["conf-1"],
  ...overrides,
});

const createConference = (overrides: Partial<Conference> = {}): Conference => ({
  id: "conf-1",
  tenant_id: "tenant-1",
  name: "Test Conference",
  abbreviation: "TC",
  description: null,
  website: null,
  logo_url: null,
  start_date: null,
  end_date: null,
  venue_name: null,
  venue_address: null,
  city: null,
  country: null,
  timezone: null,
  venue_type: "onsite",
  virtual_platform_url: null,
  social_links: {},
  team_members: [],
  settings: {},
  is_active: true,
  is_published: true,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  managers_count: 0,
  team_count: 0,
  status: "upcoming",
  ...overrides,
});

describe("LocationTree", () => {
  describe("single-conference mode", () => {
    const defaultProps = {
      mode: "single-conference" as const,
      singleConferenceLocations: [] as Location[],
      selectedLocationId: null,
      onSelectLocation: vi.fn(),
      searchQuery: "",
      onSearchChange: vi.fn(),
      typeMap: mockTypeMap,
    };

    it("renders search input", () => {
      render(<LocationTree {...defaultProps} />);
      expect(screen.getByPlaceholderText("Search locations...")).toBeInTheDocument();
    });

    it("shows 'No locations' when list is empty", () => {
      render(<LocationTree {...defaultProps} />);
      expect(screen.getByText("No locations")).toBeInTheDocument();
    });

    it("renders locations when provided", () => {
      const locations = [
        createLocation({ id: "1", name: "Main Hall" }),
        createLocation({ id: "2", name: "Room A" }),
      ];
      render(<LocationTree {...defaultProps} singleConferenceLocations={locations} />);

      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.getByText("Room A")).toBeInTheDocument();
    });

    it("calls onSearchChange when typing in search", async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn();
      render(<LocationTree {...defaultProps} onSearchChange={onSearchChange} />);

      const searchInput = screen.getByPlaceholderText("Search locations...");
      await user.type(searchInput, "Main");

      expect(onSearchChange).toHaveBeenCalled();
    });

    it("filters locations by search query", () => {
      const locations = [
        createLocation({ id: "1", name: "Main Hall" }),
        createLocation({ id: "2", name: "Room A" }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          searchQuery="main"
        />,
      );

      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.queryByText("Room A")).not.toBeInTheDocument();
    });

    it("filters locations by code", () => {
      const locations = [
        createLocation({ id: "1", name: "Main Hall", code: "MH" }),
        createLocation({ id: "2", name: "Room A", code: "RA" }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          searchQuery="mh"
        />,
      );

      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.queryByText("Room A")).not.toBeInTheDocument();
    });

    it("shows 'No matching locations' when search has no results", () => {
      const locations = [createLocation({ id: "1", name: "Main Hall" })];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          searchQuery="nonexistent"
        />,
      );

      expect(screen.getByText("No matching locations")).toBeInTheDocument();
    });

    it("calls onSelectLocation when location is clicked", async () => {
      const user = userEvent.setup();
      const onSelectLocation = vi.fn();
      const locations = [createLocation({ id: "1", name: "Main Hall" })];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          onSelectLocation={onSelectLocation}
        />,
      );

      await user.click(screen.getByText("Main Hall"));
      expect(onSelectLocation).toHaveBeenCalledWith(locations[0]);
    });

    it("highlights selected location", () => {
      const locations = [createLocation({ id: "1", name: "Main Hall" })];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          selectedLocationId="1"
        />,
      );

      const button = screen.getByText("Main Hall").closest("button");
      expect(button?.className).toContain("bg-primary-50");
    });

    it("shows active indicator for active locations", () => {
      const locations = [createLocation({ id: "1", name: "Main Hall", is_active: true })];
      const { container } = render(
        <LocationTree {...defaultProps} singleConferenceLocations={locations} />,
      );

      const indicator = container.querySelector(".bg-green-400");
      expect(indicator).toBeInTheDocument();
    });

    it("shows inactive indicator for inactive locations", () => {
      const locations = [createLocation({ id: "1", name: "Main Hall", is_active: false })];
      const { container } = render(
        <LocationTree {...defaultProps} singleConferenceLocations={locations} />,
      );

      const indicator = container.querySelector(".bg-red-400");
      expect(indicator).toBeInTheDocument();
    });

    it("applies dark theme styling", () => {
      const locations = [createLocation({ id: "1", name: "Main Hall" })];
      render(
        <LocationTree
          {...defaultProps}
          singleConferenceLocations={locations}
          theme="dark"
        />,
      );

      const searchInput = screen.getByPlaceholderText("Search locations...");
      expect(searchInput.className).toContain("bg-gray-800");
    });
  });

  describe("multi-conference mode", () => {
    const defaultProps = {
      mode: "multi-conference" as const,
      conferences: [] as Conference[],
      locations: [] as Location[],
      expandedConferences: new Set<string>(),
      onToggleConference: vi.fn(),
      selectedLocationId: null,
      onSelectLocation: vi.fn(),
      searchQuery: "",
      onSearchChange: vi.fn(),
      typeMap: mockTypeMap,
    };

    it("renders search input", () => {
      render(<LocationTree {...defaultProps} />);
      expect(screen.getByPlaceholderText("Search locations...")).toBeInTheDocument();
    });

    it("shows 'No locations found' when list is empty", () => {
      render(<LocationTree {...defaultProps} />);
      expect(screen.getByText("No locations found")).toBeInTheDocument();
    });

    it("groups locations by conference", () => {
      const conferences = [
        createConference({ id: "conf-1", name: "Conference A" }),
        createConference({ id: "conf-2", name: "Conference B" }),
      ];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
        createLocation({ id: "2", name: "Room 2", conference_ids: ["conf-2"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set(["conf-1", "conf-2"])}
        />,
      );

      expect(screen.getByText("Conference A")).toBeInTheDocument();
      expect(screen.getByText("Conference B")).toBeInTheDocument();
    });

    it("shows location count next to conference name", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
        createLocation({ id: "2", name: "Room 2", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
        />,
      );

      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("calls onToggleConference when conference header is clicked", async () => {
      const user = userEvent.setup();
      const onToggleConference = vi.fn();
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          onToggleConference={onToggleConference}
        />,
      );

      await user.click(screen.getByText("Conference A"));
      expect(onToggleConference).toHaveBeenCalledWith("conf-1");
    });

    it("expands conference when in expandedConferences set", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set(["conf-1"])}
        />,
      );

      expect(screen.getByText("Room 1")).toBeInTheDocument();
    });

    it("collapses conference when not in expandedConferences set", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set()}
        />,
      );

      expect(screen.queryByText("Room 1")).not.toBeInTheDocument();
    });

    it("expands conference when it has selected location", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set()}
          selectedLocationId="1"
        />,
      );

      expect(screen.getByText("Room 1")).toBeInTheDocument();
    });

    it("expands all conferences when there is a search query", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set()}
          searchQuery="room"
        />,
      );

      expect(screen.getByText("Room 1")).toBeInTheDocument();
    });

    it("filters by conference name", () => {
      const conferences = [
        createConference({ id: "conf-1", name: "Alpha Conference" }),
        createConference({ id: "conf-2", name: "Beta Conference" }),
      ];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: ["conf-1"] }),
        createLocation({ id: "2", name: "Room 2", conference_ids: ["conf-2"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          searchQuery="alpha"
        />,
      );

      expect(screen.getByText("Alpha Conference")).toBeInTheDocument();
      expect(screen.queryByText("Beta Conference")).not.toBeInTheDocument();
    });

    it("groups unassigned locations under 'Unassigned'", () => {
      const conferences = [createConference({ id: "conf-1", name: "Conference A" })];
      const locations = [
        createLocation({ id: "1", name: "Room 1", conference_ids: [] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set(["__unassigned__"])}
        />,
      );

      expect(screen.getByText("Unassigned")).toBeInTheDocument();
    });

    it("shows locations in multiple conferences", () => {
      const conferences = [
        createConference({ id: "conf-1", name: "Conference A" }),
        createConference({ id: "conf-2", name: "Conference B" }),
      ];
      const locations = [
        createLocation({ id: "1", name: "Shared Room", conference_ids: ["conf-1", "conf-2"] }),
      ];
      render(
        <LocationTree
          {...defaultProps}
          conferences={conferences}
          locations={locations}
          expandedConferences={new Set(["conf-1", "conf-2"])}
        />,
      );

      // The same room should appear under both conferences
      const sharedRooms = screen.getAllByText("Shared Room");
      expect(sharedRooms).toHaveLength(2);
    });
  });
});
