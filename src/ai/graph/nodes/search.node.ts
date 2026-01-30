import { IGraphState, VehicleRecommendation } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('SearchNode');

/**
 * Search Node - Performs vehicle search based on profile
 * Note: This node delegates to VectorSearchService injected at runtime
 */
export async function searchNode(
  state: IGraphState,
  searchFn?: (profile: any) => Promise<VehicleRecommendation[]>,
): Promise<Partial<IGraphState>> {
  logger.log('Executing search with profile:', JSON.stringify(state.profile));

  // If no search function provided, return empty and let recommendation handle it
  if (!searchFn) {
    logger.warn('No search function provided, moving to recommendation');
    return {
      next: 'recommendation',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  try {
    const recommendations = await searchFn(state.profile);

    if (recommendations.length === 0) {
      logger.log('No vehicles found matching criteria');
      return {
        next: 'recommendation',
        recommendations: [],
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          flags: [...state.metadata.flags, 'no_results'],
        },
      };
    }

    logger.log(`Found ${recommendations.length} vehicles`);

    // Store last shown vehicles in profile for reference
    const lastShownVehicles = recommendations.slice(0, 3).map((rec) => ({
      vehicleId: rec.vehicleId,
      brand: rec.vehicle?.make || '',
      model: rec.vehicle?.model || '',
      year: rec.vehicle?.yearModel || 0,
      price: rec.vehicle?.price || 0,
    }));

    return {
      next: 'recommendation',
      recommendations: recommendations.slice(0, 3),
      profile: {
        ...state.profile,
        _lastShownVehicles: lastShownVehicles,
        _showedRecommendation: true,
      },
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  } catch (error) {
    logger.error('Search failed:', error);
    return {
      next: 'recommendation',
      recommendations: [],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        errorCount: state.metadata.errorCount + 1,
        flags: [...state.metadata.flags, 'search_error'],
      },
    };
  }
}

/**
 * Create search node with injected search function
 */
export function createSearchNode(
  searchFn: (profile: any) => Promise<VehicleRecommendation[]>,
) {
  return async (state: IGraphState): Promise<Partial<IGraphState>> => {
    return searchNode(state, searchFn);
  };
}
