import { DeliveryStatusMapper } from '../../../domain/ports/DeliveryStatusMapper';
import { InternalDeliveryStatus } from '../../../domain/enums/InternalDeliveryStatus';
import { UnknownDeliveryStatusError } from '../../../domain/errors/DeliveryIntegrationErrors';
import { ELOGISTIA_STATUS_MAP } from './ElogistiaStatusLabels';

export class ElogistiaStatusMapper implements DeliveryStatusMapper {
  readonly provider = 'elogistia';

  map(rawStatus: string): InternalDeliveryStatus {
    const key = normalize(rawStatus);
    const mapped = ELOGISTIA_STATUS_MAP.get(key);
    if (!mapped) {
      throw new UnknownDeliveryStatusError(rawStatus);
    }
    return mapped;
  }
}

function normalize(rawStatus: string): string {
  return rawStatus.trim().toLowerCase();
}
