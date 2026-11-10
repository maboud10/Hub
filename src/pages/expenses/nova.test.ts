import { describe, expect, it } from 'vitest';
import { parseDateHint, parseMoney, parseNights, parseNovaIntent, readReceiptDraft, readTripDraft, receiptDraftToSearch, tripDraftToSearch } from './nova';

// Monday 9 Nov 2026
const ctx = { today: '2026-11-09', homeCity: 'Dubai' };

describe('Nova · Smart receipts intent parser', () => {
  it('reads amounts in codes, words and symbols', () => {
    expect(parseMoney('Taxi to DXB airport 85 AED')).toMatchObject({ amount: 85, currency: 'AED' });
    expect(parseMoney('Hotel in Riyadh 2 nights SAR 1,240')).toMatchObject({ amount: 1240, currency: 'SAR' });
    expect(parseMoney('£42 Heathrow Express')).toMatchObject({ amount: 42, currency: 'GBP' });
    expect(parseMoney('Conference pass 1.2k dollars')).toMatchObject({ amount: 1200, currency: 'USD' });
    expect(parseMoney('Lunch with 4 clients')).toBeNull();
  });

  it('turns a spend into a receipt draft', () => {
    const taxi = parseNovaIntent('Taxi to DXB airport 85 AED', ctx);
    expect(taxi.kind).toBe('expense');
    if (taxi.kind !== 'expense') return;
    expect(taxi.draft).toMatchObject({ merchant: 'Dubai Taxi', amount: 85, currency: 'AED', category: 'ground', date: '2026-11-09', payment: 'personal_reimbursable' });

    const lunch = parseNovaIntent('Team lunch at Zuma 640 AED with 4 clients yesterday', ctx);
    expect(lunch.kind === 'expense' && lunch.draft).toMatchObject({ merchant: 'Zuma', category: 'client', attendees: '4 clients', date: '2026-11-08' });

    const hotel = parseNovaIntent('Hotel in Riyadh 2 nights SAR 1,240 on the corporate card', ctx);
    expect(hotel.kind === 'expense' && hotel.draft).toMatchObject({ merchant: 'Hotel · Riyadh', category: 'lodging', amount: 1240, currency: 'SAR', payment: 'corporate_card' });

    const bare = parseNovaIntent('Coffee 28', ctx);
    expect(bare.kind === 'expense' && bare.draft).toMatchObject({ amount: 28, currency: 'AED', category: 'meals' });
  });

  it('turns a plan into a trip draft', () => {
    const trip = parseNovaIntent('Trip to London next week for the summit', ctx);
    expect(trip.kind).toBe('trip');
    if (trip.kind !== 'trip') return;
    expect(trip.draft).toMatchObject({
      city: 'London',
      country: 'United Kingdom',
      departureDate: '2026-11-16',
      returnDate: '2026-11-19',
      purpose: 'client-summit',
      title: 'London Summit',
      cabin: 'economy',
    });

    const onsite = parseNovaIntent('Fly to Berlin on 3 Dec for 4 days for the SRE onsite', ctx);
    expect(onsite.kind === 'trip' && onsite.draft).toMatchObject({ city: 'Berlin', departureDate: '2026-12-03', returnDate: '2026-12-06', purpose: 'engineering-onsite', title: 'Berlin SRE Onsite' });

    const unknownCity = parseNovaIntent('Business trip to Paris in two weeks', ctx);
    expect(unknownCity.kind === 'trip' && unknownCity.draft).toMatchObject({ city: 'Paris', departureDate: '2026-11-23', cabin: 'economy' });
  });

  it('routes status and report questions', () => {
    expect(parseNovaIntent('Where is my money?', ctx).kind).toBe('status');
    expect(parseNovaIntent('Submit an expense report for my receipts', ctx).kind).toBe('report');
    expect(parseNovaIntent('hello there', ctx)).toEqual({ kind: 'unknown', notes: 'Hello there' });
  });

  it('understands relative dates and durations', () => {
    expect(parseDateHint('last friday', ctx.today, 'past')).toBe('2026-11-06');
    expect(parseDateHint('on friday', ctx.today, 'future')).toBe('2026-11-13');
    expect(parseDateHint('Jan 12', ctx.today, 'future')).toBe('2027-01-12');
    expect(parseDateHint('next month', ctx.today, 'future')).toBe('2026-12-07');
    expect(parseNights('for a week')).toBe(6);
    expect(parseNights('3 nights')).toBe(3);
  });

  it('round-trips drafts through URL params and rejects junk', () => {
    const trip = parseNovaIntent('Trip to Tokyo on Jan 12 for 5 days in business class', ctx);
    if (trip.kind !== 'trip') throw new Error('expected trip');
    expect(readTripDraft(new URLSearchParams(tripDraftToSearch(trip.draft)))).toMatchObject({ city: 'Tokyo', departureDate: '2027-01-12', returnDate: '2027-01-16', cabin: 'business' });

    const sp = new URLSearchParams(receiptDraftToSearch({ merchant: 'Uber', amount: 42, currency: 'GBP', category: 'ground', payment: 'corporate_card' }));
    expect(readReceiptDraft(sp)).toMatchObject({ merchant: 'Uber', amount: 42, currency: 'GBP', category: 'ground', payment: 'corporate_card' });
    expect(readReceiptDraft(new URLSearchParams('nova=1&currency=XYZ&category=nope&amount=-3&date=soon'))).toEqual({});
    expect(readReceiptDraft(new URLSearchParams('merchant=Uber'))).toBeNull();
    expect(readTripDraft(new URLSearchParams('new=1'))).toBeNull();
  });
});
