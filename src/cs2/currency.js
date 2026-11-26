export const CS2_RATES = {
  coinsPerUsd: 100,
  bynPerUsd: 3.25,
  rubPerUsd: 95,
}

export const CS2_CURRENCIES = [
  { id: 'coins', label: 'КС коины', short: 'КС', symbol: 'КС' },
  { id: 'usd', label: 'Доллары (USD)', short: '$', symbol: '$' },
  { id: 'byn', label: 'Белорусские рубли (BYN)', short: 'BYN', symbol: 'BYN' },
  { id: 'rub', label: 'Российские рубли (RUB)', short: 'RUB', symbol: '₽' },
]

export function convertFromCoins(coins, currency = 'coins') {
  const value = Number(coins) || 0
  const usd = value / CS2_RATES.coinsPerUsd
  if (currency === 'usd') return usd
  if (currency === 'byn') return usd * CS2_RATES.bynPerUsd
  if (currency === 'rub') return usd * CS2_RATES.rubPerUsd
  return value
}

export function formatCs2Price(coins, currency = 'coins') {
  const value = convertFromCoins(coins, currency)
  if (currency === 'coins') {
    return `${Math.round(value).toLocaleString('ru-RU')} КС`
  }
  if (currency === 'usd') {
    return `$${value.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  if (currency === 'byn') {
    return `${value.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} BYN`
  }
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} RUB`
}

export function currencyById(id) {
  return CS2_CURRENCIES.find((item) => item.id === id) || CS2_CURRENCIES[0]
}
