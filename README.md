## Installation

`npm i ember-cli-mirage-sfp`

## What is it?

The module provides code for filtering, sorting and paginating JSON API results sets, based on the JSON API specification for sending query params to the server.

## Usage

Import in `mirage/config.js`

`import mirageFSP from 'mirage-sort-filter-paginate';`

## Options

Set `options` on mirageFSP as below.

The options hash allows a key `_default`. The options defined under `_default` will act as a fallback for any models which don't have their own options defined.

The options has can then have a separate child object for each model which you would like to sort, filter or paginate.

The example below shows options whioch sett he default max and min page sizes, and then has more involved options for the `payments` model, which has the properties `description, accountName, amount, direction, date, tags.`

```javascript
mirageFSP.options = {
  _defaults: { // Applies to all models unless overrides
    maxPageSize: 20, // Default = 100. Sets the maximum allowed page size, and will override `page[size]` in the query params if the query param exceeds maxPageSize.
    minPageSize: 5, // Default = 10. Sets the minimum allowed page size, and will override `page[size]` in the query params if the query param is smaller than minPageSize.
  }
  payments: {
    paramsToModelMappings: { // Tells mirageFSP which model propery each query param key pertains to. This is only required where the query param key and model name differ. For example, min_amount is a query param key that requires filtering on the amount property of the payment model.
      min_amount: 'amount',
      max_amount: 'amount',
      date_from: 'date',
      date_to: 'date',
    },
    modelTypes: { // Tells FSP what kind of data each model property is. This ios required so that it
      amount: 'number',
      date: 'date',
      tags: 'array'
    },

    filterFunctionsMap: {
      description: 'string',
      account_name: 'string',
      direction: 'array',
      date_from: 'date_gte',
      date_to: 'date_lte',
      tags: 'custom',
      min_amount: 'gte',
      max_amount: 'lte',
    },
    customFilters: customFilters,
    maxPageSize: 50,
    minPageSize: 5,
  },
};
```
