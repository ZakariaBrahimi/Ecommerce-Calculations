import { InternalDeliveryStatus } from '../../../domain/enums/InternalDeliveryStatus';

/**
 * Elogistia's raw status labels (French), as enumerated in its Postman
 * documentation ("Liste des status des commandes"), mapped to ProfitFlow
 * AI's internal lifecycle. See docs/integrations/elogistia-api.md §2 for
 * the rationale behind each mapping, especially the ambiguous ones
 * ("Partiel", "Suspendue") called out there.
 *
 * Keys are lower-cased and trimmed at lookup time (ElogistiaStatusMapper),
 * so entries here should be the canonical label with normal casing/spacing.
 */
export const ELOGISTIA_STATUS_MAP: ReadonlyMap<string, InternalDeliveryStatus> = new Map([
  ['brouillon', InternalDeliveryStatus.NEW],

  ['à ramasser', InternalDeliveryStatus.CONFIRMED],
  ['a ramasser', InternalDeliveryStatus.CONFIRMED],
  ['ramassage à relancer', InternalDeliveryStatus.CONFIRMED],
  ['ramassage a relancer', InternalDeliveryStatus.CONFIRMED],
  ['à remettre', InternalDeliveryStatus.CONFIRMED],
  ['a remettre', InternalDeliveryStatus.CONFIRMED],
  ['en cours de ramassage', InternalDeliveryStatus.CONFIRMED],

  ['ramassée', InternalDeliveryStatus.SHIPPED],
  ['ramassee', InternalDeliveryStatus.SHIPPED],
  ['à expédiée', InternalDeliveryStatus.SHIPPED],
  ['a expediee', InternalDeliveryStatus.SHIPPED],
  ['en transit', InternalDeliveryStatus.SHIPPED],
  ['en hub', InternalDeliveryStatus.SHIPPED],
  ['en cours livraison', InternalDeliveryStatus.SHIPPED],
  ['en cours de livraison', InternalDeliveryStatus.SHIPPED],
  ['réceptionnée', InternalDeliveryStatus.SHIPPED],
  ['receptionnee', InternalDeliveryStatus.SHIPPED],

  ['livrée', InternalDeliveryStatus.DELIVERED],
  ['livree', InternalDeliveryStatus.DELIVERED],
  ['livrée & réglée', InternalDeliveryStatus.DELIVERED],
  ['livree & reglee', InternalDeliveryStatus.DELIVERED],
  // Partial delivery: some of the package reached the customer. Treated as
  // DELIVERED (positive outcome) rather than FAILED/RETURNED - flag for
  // manual review via the retained raw status if finer accounting is needed.
  ['partiel', InternalDeliveryStatus.DELIVERED],

  ['annulée', InternalDeliveryStatus.FAILED],
  ['annulee', InternalDeliveryStatus.FAILED],
  ['perdue', InternalDeliveryStatus.FAILED],
  ['cassée', InternalDeliveryStatus.FAILED],
  ['cassee', InternalDeliveryStatus.FAILED],
  // Suspended is not itself terminal in Elogistia's workflow, but ProfitFlow
  // AI's enum has no "on hold" state; FAILED surfaces it for seller
  // attention rather than silently treating it as still in progress.
  ['suspendue', InternalDeliveryStatus.FAILED],

  ['retour reçu', InternalDeliveryStatus.RETURNED],
  ['retour recu', InternalDeliveryStatus.RETURNED],
  ['retour en transit', InternalDeliveryStatus.RETURNED],
  ['retour remis', InternalDeliveryStatus.RETURNED],
  ['partiel remis', InternalDeliveryStatus.RETURNED],
]);
