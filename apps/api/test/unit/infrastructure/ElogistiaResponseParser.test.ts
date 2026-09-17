import {
  parseManyTrackingResponse,
  parseOrdersResponse,
} from '../../../src/infrastructure/providers/elogistia/ElogistiaResponseParser';

// Fixtures below are taken verbatim (trimmed) from the Elogistia Postman
// collection's sample responses - see docs/integrations/elogistia-api.md.

describe('parseOrdersResponse', () => {
  it('parses the single-order "détails de la commande" shape (tracking supplied)', () => {
    const body = {
      body: [
        {
          CommandeID: '209304',
          Nom: 'rezig',
          ['Prénom']: '',
          Tracking: 'ELO-35B-063261777544',
          Addresse: 'a domicile',
          ['Téléphone']: '0555555555',
          ['E-mail']: '',
          ['Commune ']: 'Bordj El Emir Abdelkader',
          ['Wilaya ']: 'Tissemsilt',
          ['Frais ELogistia']: '800',
          ['Frais de livraison']: '800',
          Remarque: '',
          Status: 'En transit',
        },
      ],
      itemCount: 1,
    };

    const [order] = parseOrdersResponse(body, 'ELO-35B-063261777544');

    expect(order.trackingNumber).toBe('ELO-35B-063261777544');
    expect(order.externalOrderId).toBe('209304');
    expect(order.customerName).toBe('rezig');
    expect(order.commune).toBe('Bordj El Emir Abdelkader');
    expect(order.wilaya).toBe('Tissemsilt');
    expect(order.deliveryFee).toBe(800);
    expect(order.rawStatus).toBe('En transit');
  });

  it('parses the full-list "Liste des commandes" shape (no tracking filter)', () => {
    const body = {
      body: [
        {
          name: 'Amine',
          ['id de client']: 8,
          firstname: 'Salhiiii',
          suivi: '5901234123457',
          address: 'City des annassers 2 bt 6 N 10',
          ['E-mail']: '3adjib@gmail.com',
          ['Téléphone']: '0555555555',
          ['Commuhne ']: 2,
          ['Frais de livraison']: 1100,
          Remarque: 'rien',
          ['Validation Elogistia']: 5,
        },
      ],
      itemCount: 1,
    };

    const [order] = parseOrdersResponse(body, undefined);

    expect(order.trackingNumber).toBe('5901234123457');
    // This shape has no order id, only a customer id - must not be confused.
    expect(order.externalOrderId).toBeNull();
    expect(order.customerName).toBe('Amine Salhiiii');
    expect(order.wilaya).toBeNull();
    expect(order.deliveryFee).toBe(1100);
    // No text status on this shape - surfaced as an unmapped sentinel.
    expect(order.rawStatus).toBe('elogistia-code:5');
  });
});

describe('parseManyTrackingResponse', () => {
  it('picks the most recent history entry with a non-empty Statut', () => {
    const body = [
      {
        tracking: 'L-372BNH',
        count: 4,
        validation: '68',
        historique: [
          { logtext: 'Ramasser', Statut: 'Ramassée', Date: '2023-04-17 12:19:43', Tentative: '0' },
          { logtext: ' Réception commande ', Statut: '', Date: '2023-04-17 13:01:35', Tentative: '0' },
          {
            logtext: 'Dispatché au livreur',
            Statut: 'En cours livraison',
            Date: '2023-04-17 14:44:58',
            Tentative: '0',
          },
          { logtext: 'Refus client', Statut: 'Retour', Date: '2023-04-17 17:15:18', Tentative: '1' },
        ],
      },
    ];

    const [status] = parseManyTrackingResponse(body);

    expect(status.trackingNumber).toBe('L-372BNH');
    expect(status.rawStatus).toBe('Retour');
    expect(status.occurredAt.toISOString()).toContain('2023-04-17');
  });

  it('skips entries with no tracking number and returns an empty array for an empty history', () => {
    const body = [{ tracking: 'X-1', historique: [] }, { historique: [{ Statut: 'Livrée', Date: '2024-01-01 00:00:00' }] }];
    expect(parseManyTrackingResponse(body)).toEqual([]);
  });
});
