import { memo } from 'react';
import type { Location, Conference, TenantLocationType } from '../types';

interface LocationTreeProps {
  mode: 'multi-conference' | 'single-conference';
  conferences?: Conference[];
  locations?: Location[];
  expandedConferences?: Set<string>;
  onToggleConference?: (id: string) => void;
  singleConferenceLocations?: Location[];
  selectedLocationId: string | null;
  onSelectLocation: (location: Location) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  typeMap: Record<string, TenantLocationType>;
  theme?: 'light' | 'dark';
}

interface ConferenceTreeNode {
  conference: Conference;
  locations: Location[];
}

function buildConferenceTree(
  locations: Location[],
  conferences: Conference[]
): ConferenceTreeNode[] {
  const confMap = new Map(conferences.map((c) => [c.id, c]));
  const grouped = new Map<string, Location[]>();

  for (const loc of locations) {
    if (loc.conference_ids && loc.conference_ids.length > 0) {
      for (const cid of loc.conference_ids) {
        if (!grouped.has(cid)) grouped.set(cid, []);
        grouped.get(cid)!.push(loc);
      }
    } else {
      if (!grouped.has('__unassigned__')) grouped.set('__unassigned__', []);
      grouped.get('__unassigned__')!.push(loc);
    }
  }

  const nodes: ConferenceTreeNode[] = [];

  for (const [cid, locs] of grouped) {
    if (cid === '__unassigned__') {
      nodes.push({
        conference: { id: '__unassigned__', name: 'Unassigned' } as Conference,
        locations: locs.sort((a, b) => a.name.localeCompare(b.name)),
      });
    } else {
      const conf = confMap.get(cid);
      if (conf) {
        nodes.push({
          conference: conf,
          locations: locs.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }
  }

  nodes.sort((a, b) => {
    if (a.conference.id === '__unassigned__') return 1;
    if (b.conference.id === '__unassigned__') return -1;
    return a.conference.name.localeCompare(b.conference.name);
  });

  return nodes;
}

const LocationItem = memo(function LocationItem({
  location,
  isSelected,
  onSelect,
  typeMap,
  theme = 'light',
}: {
  location: Location;
  isSelected: boolean;
  onSelect: () => void;
  typeMap: Record<string, TenantLocationType>;
  theme?: 'light' | 'dark';
}) {
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
        isSelected
          ? dark
            ? 'bg-gray-700 text-white font-medium'
            : 'bg-primary-50 text-primary-700 font-medium'
          : dark
            ? 'text-gray-300 hover:bg-gray-800'
            : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <span
        className={`flex-shrink-0 w-2 h-2 rounded-full ${
          location.is_active ? 'bg-green-400' : 'bg-red-400'
        }`}
      />
      <span className="truncate text-left flex-1">{location.name}</span>
      {!dark && (
        <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
          {typeMap[location.location_type]?.name || location.location_type}
        </span>
      )}
    </button>
  );
});

export default function LocationTree({
  mode,
  conferences = [],
  locations = [],
  expandedConferences = new Set(),
  onToggleConference,
  singleConferenceLocations = [],
  selectedLocationId,
  onSelectLocation,
  searchQuery,
  onSearchChange,
  typeMap,
  theme = 'light',
}: LocationTreeProps) {
  const lowerQuery = searchQuery.toLowerCase();
  const dark = theme === 'dark';

  if (mode === 'single-conference') {
    const filtered = lowerQuery
      ? singleConferenceLocations.filter(
          (loc) =>
            loc.name.toLowerCase().includes(lowerQuery) ||
            (loc.code && loc.code.toLowerCase().includes(lowerQuery))
        )
      : singleConferenceLocations;

    return (
      <div className="flex flex-col h-full">
        <div className={`p-3 border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <input
            type="text"
            placeholder="Search locations..."
            className={`w-full rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
              dark
                ? 'bg-gray-800 border-gray-600 text-gray-200 placeholder-gray-400'
                : 'border border-gray-300'
            }`}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <p className={`text-xs text-center py-4 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              {lowerQuery ? 'No matching locations' : 'No locations'}
            </p>
          ) : (
            filtered.map((loc) => (
              <LocationItem
                key={loc.id}
                location={loc}
                isSelected={loc.id === selectedLocationId}
                onSelect={() => onSelectLocation(loc)}
                typeMap={typeMap}
                theme={theme}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // Multi-conference mode
  const treeNodes = buildConferenceTree(locations, conferences);

  // Filter by search
  const filteredNodes = lowerQuery
    ? treeNodes
        .map((node) => ({
          ...node,
          locations: node.locations.filter(
            (loc) =>
              loc.name.toLowerCase().includes(lowerQuery) ||
              (loc.code && loc.code.toLowerCase().includes(lowerQuery)) ||
              node.conference.name.toLowerCase().includes(lowerQuery)
          ),
        }))
        .filter((node) => node.locations.length > 0)
    : treeNodes;

  return (
    <div className="flex flex-col h-full">
      <div className={`p-3 border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
        <input
          type="text"
          placeholder="Search locations..."
          className={`w-full rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
            dark
              ? 'bg-gray-800 border-gray-600 text-gray-200 placeholder-gray-400'
              : 'border border-gray-300'
          }`}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filteredNodes.length === 0 ? (
          <p className={`text-xs text-center py-4 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            {lowerQuery ? 'No matching locations' : 'No locations found'}
          </p>
        ) : (
          filteredNodes.map((node) => {
            const hasSelectedLocation = node.locations.some((loc) => loc.id === selectedLocationId);
            const isExpanded =
              !!lowerQuery || expandedConferences.has(node.conference.id) || hasSelectedLocation;

            return (
              <div key={node.conference.id} className="mb-1">
                {/* Conference header */}
                <button
                  type="button"
                  onClick={() => onToggleConference?.(node.conference.id)}
                  className={`w-full flex items-center px-2 py-1.5 text-sm font-semibold rounded-md ${
                    dark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg
                    className={`w-4 h-4 mr-1.5 transition-transform duration-200 ${
                      dark ? 'text-gray-500' : 'text-gray-400'
                    } ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="truncate">{node.conference.name}</span>
                  <span
                    className={`ml-auto text-xs font-normal ${dark ? 'text-gray-500' : 'text-gray-400'}`}
                  >
                    {node.locations.length}
                  </span>
                </button>

                {/* Location children */}
                {isExpanded && (
                  <div className="ml-5 space-y-0.5">
                    {node.locations.map((loc) => (
                      <LocationItem
                        key={loc.id}
                        location={loc}
                        isSelected={loc.id === selectedLocationId}
                        onSelect={() => onSelectLocation(loc)}
                        typeMap={typeMap}
                        theme={theme}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
