import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BODY_BACK, BODY_BACK_VIEWBOX, BODY_FRONT, BODY_FRONT_VIEWBOX, BodyRegion } from '../assets/bodyMap';
import { MuscleKey } from '../assets/muscles';

export const MUSCLE_COLORS = {
  primary: '#2D6A4F',
  secondary: '#8FCFAE',
  body: '#E2E2E2',
};

interface Props {
  primary: MuscleKey[];
  secondary: MuscleKey[];
  // Width of the whole figure (front + back side by side).
  width: number;
}

// Front and back body outlines with the exercise's primary muscles in dark green and its
// secondary muscles in light green. Path data: see assets/bodyMap.ts.
export default function MuscleMap({ primary, secondary, width }: Props) {
  const fillFor = (region: BodyRegion): string => {
    if (region.muscles.some((m) => primary.includes(m))) return MUSCLE_COLORS.primary;
    if (region.muscles.some((m) => secondary.includes(m))) return MUSCLE_COLORS.secondary;
    return MUSCLE_COLORS.body;
  };

  // Each view of the source drawing is 1 wide by 2 tall.
  const figureWidth = width / 2;
  const figureHeight = figureWidth * 2;

  const figure = (regions: BodyRegion[], viewBox: string, label: string) => (
    <View style={styles.figure}>
      <Svg width={figureWidth} height={figureHeight} viewBox={viewBox} accessibilityLabel={`Body ${label.toLowerCase()} view`}>
        {regions.flatMap((region, i) => {
          const fill = fillFor(region);
          return region.paths.map((d, j) => <Path key={`${i}-${j}`} d={d} fill={fill} />);
        })}
      </Svg>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );

  return (
    <View>
      <View style={styles.figures}>
        {figure(BODY_FRONT, BODY_FRONT_VIEWBOX, 'Front')}
        {figure(BODY_BACK, BODY_BACK_VIEWBOX, 'Back')}
      </View>
      <View style={styles.legend}>
        <LegendItem color={MUSCLE_COLORS.primary} label="Primary" />
        {secondary.length > 0 && <LegendItem color={MUSCLE_COLORS.secondary} label="Secondary" />}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', justifyContent: 'center' },
  figure: { alignItems: 'center' },
  figureLabel: { fontSize: 11, fontWeight: '600', color: '#999', letterSpacing: 0.5, marginTop: -4 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12, color: '#666' },
});
