// Dados fictícios exclusivos dos testes; nenhuma credencial ou chamada externa.
export const testOrderId = 'ORDTST01KS5AJ6HTK2HRQ3XJ3C2JCKP9'
export const testPaymentId = 'PAY01J67CQQH5904WDBVZEM4JMEP3'
export function testProviderOrder(reference: string, id = testOrderId, changes: Record<string, unknown> = {}) {
  return {
    id, type: 'online', processing_mode: 'manual', status: 'processed', status_detail: 'accredited', external_reference: reference,
    user_id: '123', country_code: 'BRA', currency: 'BRL', total_amount: '115.16', total_paid_amount: '115.16', last_updated_date: new Date().toISOString(),
    transactions: { payments: [{ id: testPaymentId, amount: '115.16', paid_amount: '115.16', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } }] },
    ...changes,
  }
}
