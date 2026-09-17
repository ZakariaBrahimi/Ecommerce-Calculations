import { ElogistiaStatusMapper } from '../../../src/infrastructure/providers/elogistia/ElogistiaStatusMapper';
import { InternalDeliveryStatus } from '../../../src/domain/enums/InternalDeliveryStatus';
import { UnknownDeliveryStatusError } from '../../../src/domain/errors/DeliveryIntegrationErrors';

describe('ElogistiaStatusMapper', () => {
  const mapper = new ElogistiaStatusMapper();

  it.each<[string, InternalDeliveryStatus]>([
    ['Brouillon', InternalDeliveryStatus.NEW],
    ['À ramasser', InternalDeliveryStatus.CONFIRMED],
    ['Ramassage à relancer', InternalDeliveryStatus.CONFIRMED],
    ['À remettre', InternalDeliveryStatus.CONFIRMED],
    ['En cours de ramassage', InternalDeliveryStatus.CONFIRMED],
    ['Ramassée', InternalDeliveryStatus.SHIPPED],
    ['À expédiée', InternalDeliveryStatus.SHIPPED],
    ['En transit', InternalDeliveryStatus.SHIPPED],
    ['En hub', InternalDeliveryStatus.SHIPPED],
    ['En cours livraison', InternalDeliveryStatus.SHIPPED],
    ['En cours de livraison', InternalDeliveryStatus.SHIPPED],
    ['Réceptionnée', InternalDeliveryStatus.SHIPPED],
    ['Livrée', InternalDeliveryStatus.DELIVERED],
    ['Livrée & réglée', InternalDeliveryStatus.DELIVERED],
    ['Annulée', InternalDeliveryStatus.FAILED],
    ['Perdue', InternalDeliveryStatus.FAILED],
    ['Cassée', InternalDeliveryStatus.FAILED],
    ['Suspendue', InternalDeliveryStatus.FAILED],
    ['Retour reçu', InternalDeliveryStatus.RETURNED],
    ['Retour en transit', InternalDeliveryStatus.RETURNED],
    ['Retour remis', InternalDeliveryStatus.RETURNED],
    ['Partiel remis', InternalDeliveryStatus.RETURNED],
  ])('maps raw status "%s" to %s', (raw, expected) => {
    expect(mapper.map(raw)).toBe(expected);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(mapper.map('  livrée  ')).toBe(InternalDeliveryStatus.DELIVERED);
    expect(mapper.map('LIVRÉE')).toBe(InternalDeliveryStatus.DELIVERED);
  });

  it('throws UnknownDeliveryStatusError for an unrecognized label', () => {
    expect(() => mapper.map('Statut Inexistant')).toThrow(UnknownDeliveryStatusError);
  });
});
