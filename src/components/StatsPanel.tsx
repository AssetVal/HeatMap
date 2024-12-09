// src/components/StatsPanel.tsx
import { Chart, Title, Tooltip, Legend, Colors, ArcElement } from 'chart.js';
import consola from 'consola';
import { Pie } from 'solid-chartjs';
import { createEffect, createSignal, onMount } from 'solid-js';
import type { AddressFields } from '~/types';

interface Props {
  total: number;
  successful: number;
  failed: number;
  addresses: (AddressFields & {
    geocode?: {
        latitude: number;
        longitude: number;
    };
    countyDensity?: number;
  })[]
  useMiles: boolean;
}

export function StatsPanel(props: Props) {
  onMount(() => {
    Chart.register(Title, Tooltip, Legend, Colors, ArcElement);
  });

  const getDensityRanges = () =>
    [
      { min: 0, max: 10, label: '0-10', color: '#FFEDA0' },
      { min: 10, max: 20, label: '10-20', color: '#FED976' },
      { min: 20, max: 50, label: '20-50', color: '#FEB24C' },
      { min: 50, max: 100, label: '50-100', color: '#FD8D3C' },
      { min: 100, max: 200, label: '100-200', color: '#FC4E2A' },
      { min: 200, max: 500, label: '200-500', color: '#E31A1C' },
      { min: 500, max: 1000, label: '500-1000', color: '#BD0026' },
      { min: 1000, max: Infinity, label: '1000+', color: '#800026' },
    ].map((range) => ({
      ...range,
      min: props.useMiles ? range.min * 2.59 : range.min,
      max: props.useMiles ? range.max * 2.59 : range.max,
      label: `${range.label} ${props.useMiles ? 'mi²' : 'km²'}`,
    }));

  const [chartData, setChartData] = createSignal<{
    labels: string[];
    datasets: { data: number[]; backgroundColor: string[] }[];
  }>({
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
      },
    ],
  });

  createEffect(() => {
    consola.start('Processing addresses for chart:', props.addresses.length);
    const ranges = getDensityRanges();
    consola.info({
      ranges,
      addresses: props.addresses,
    })
    const addressesWithDensity = props.addresses.filter(
      (addr) => addr?.countyDensity !== undefined && addr?.countyDensity !== null,
    );

    const distribution = ranges
      .map((range) => ({
        range,
        count: addressesWithDensity.filter((addr) => {
          const density = addr?.countyDensity || 0;
          return density >= range.min && density < range.max;
        }).length,
      }))
      .filter((d) => d.count > 0); // Only show ranges with data

    setChartData({
      labels: distribution.map((d) => d.range.label),
      datasets: [
        {
          data: distribution.map((d) => d.count),
          backgroundColor: distribution.map((d) => d.range.color),
        },
      ],
    });
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw || 0;
            const percentage = ((value / props.successful) * 100).toFixed(1);
            return `${value} addresses (${percentage}%)`;
          },
        },
      },
      title: {
        display: true,
        text: 'Addresses by Population Density',
      },
    },
  };

  return (
    <div class="absolute bottom-60 right-4 bg-white p-4 rounded shadow-md z-[1000]">
      <div class="w-64 h-64">
        <Pie data={chartData()} options={chartOptions} />
      </div>
      <div class="mt-2 text-center text-sm text-gray-600">
        Successfully Geocoded: {props.successful}
        {props.failed > 0 && (
          <span class="text-red-600 ml-2">({props.failed} failed)</span>
        )}
      </div>
    </div>
  );
}
