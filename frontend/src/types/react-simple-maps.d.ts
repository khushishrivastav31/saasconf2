declare module 'react-simple-maps' {
  import type { ReactNode, CSSProperties } from 'react';

  interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: CSSProperties;
    className?: string;
    children?: ReactNode;
  }

  interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (args: { geographies: Geography[] }) => ReactNode;
  }

  interface Geography {
    rsmKey: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface GeographyProps {
    geography: Geography;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    className?: string;
    onClick?: () => void;
  }

  interface MarkerProps {
    coordinates: [number, number];
    children?: ReactNode;
    className?: string;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
  export function Marker(props: MarkerProps): JSX.Element;
}
