## Installation

`npm i mirage-sort-filter-paginate`

## What is it?

The module provides code for filtering, sorting and paginating JSON API results sets, based on the JSON API specification for sending query params to the server.

The response will include the array or filtered and sorted records in `data`, as well as `links` and `meta`.

## Usage

Import in `mirage/config.js`

`import mirageFSP from 'mirage-sort-filter-paginate';`

### Running it

Your route handler will need to use a full function here, as opposed to an ES6 arrow function (e.g `() => { ... }`). This is because the `run` requires the `this` context from the function handler, and an arrow function would bind `this` from the outer scope.

In your route handler return

```javascript
mirageFSP.run(request, mirageDbModelName, schema, this);
```

That's it. The function will sort, filter and paginate your results based on your JSON API format query params for `sort`, `filter`, `page` and `size` and return a JSON API formatted response.

```javascript
this.get('payments', function (schema, request) {
  return mirageFSP.run(request, 'payments', schema, this);
});
```

## Options

Set `options` on mirageFSP as below.

Each top level key in options must either be a model name in your Mirage DB, or be `_default`.

The options defined under a model name will only apply when fetching records from that model.

The options defined under `_default` will act as a fallback for any models which don't have their own options defined.

Each set of options can have `maxPageSize`, `minPageSize`, `filterMethods` and `sortMethods`.

The example below shows options which set the default max and min page sizes, and then has more involved options for the `payments` model, which has the properties `description, accountName, amount, direction, date, tags.`

```javascript
mirageFSP.options = {
  _defaults: { // Applies to all models unless overridden
    maxPageSize: 20,
    minPageSize: 5,
  }
  payments: {
    sortMethods: { // Tells FSP what kind of sorting algorithm to use for each sortable query param. The default is string, so you only need to specificy the sortMethod for number, date and arrayLength.
      _default: {method: 'string'},
      amount: {method: 'number'},
      date: {method: 'date', dbProp: 'insertedAt'}
      tags: {method: 'array_length', dbProp: 'insertedAt'}
      description: (sortProp, sortDirection, items, modelName) => {
        // Return "items" sorted in any way.
      },

    },
    filterMethods: {
      _default: {method: 'string'},
      account_name: {method: 'string'},
      direction: {method: 'array_includes'},
      date_from: {method: 'date_gte', dbProp: 'insertedAt'},
      date_to: {method: 'date_lte', dbProp: 'insertedAt'},
      min_amount: {method: 'gte', dbProp: 'amount'},
      max_amount: {method: 'lte', dbProp: 'amount'},
      tags: (dbItem, params, schema, modelName) => {
        // return false to exclude the item from the results .
      },
    },
    maxPageSize: 50,
    minPageSize: 5,
  },
};
```

### maxPageSize

Default = 100. Sets the maximum allowed page size, and will override `page[size]` in the query params if the query param exceeds `maxPageSize`.

### minPageSize

Default = 10. Sets the minimum allowed page size, and will override `page[size]` in the query params if the query param is smaller than `minPageSize`.

### filterMethods

Tells FSP what kind of filtering algorithm to use for each filter query param.

For each filter param, pass an object which must include method and can optionally include dbProp. If dbProp is not included, it will fall back to the camelised version of the filter param. For example

```javascript
filterMethods: {
  account_name: {
    method: 'string'
  },
}
```

becomes

```javascript
filterMethods: {
  account_name: {
    method: 'string'
    dpProp: 'accountName'
  },
}
```

Possible values for `method` are

- `string`
- `array_includes`
- `date_gt`
- `date_lt`
- `date_gte`
- `date_lte`
- `gt`
- `lt`
- `gte`
- `lte`
- `array_includes` - for when the DB item value is an array, and the query param passed is a single value, like a string or number. array_includes checks if the query param is in the DB item array.
- `in_array` - for when the query param passed is an array of values, or comma separated string, and the DB prop is a single value, like a number or string, and in_array checks if the DB item value is in that array.
- `array_length_lt`
- `array_intersection`
- `array_length_gt`
- `array_length_lte`
- `array_length_gte`
- a custom function, which receives `(dbItem, params, schema, modelName)` as args and must simply return `true` or `false` to include or exclude an item from filtered results.

A default filter method can be passed using the `_default` key. The example below would result in any filter param which does not correspond to a key in `filterMethods` using the `string` filterting method.

```javascript
filterMethods: {
  _default: {
    method: 'string'
  },
}

```

### sortMethods

Tells FSP what kind of sorting algorithm to use for each sort query param.

For each sort param, pass an object which must include method and can optionally include dbProp. If dbProp is not included, it will fall back to the camelised version of the sort param. For example

```javascript
sortMethods: {
  account_name: {
    method: 'string'
  },
}
```

becomes

```javascript
sortMethods: {
  account_name: {
    method: 'string'
    dpProp: 'accountName'
  },
}
```

Possible values for `method` are

- `string`
- `number`
- `date`
- `array_length`
- a custom function, which receives `(sortProp, sortDirection, items, modelName)` as args and must return `items` sorted in any way.

A default sort method can be passed using the `_default` key. The example below would result in any sort param which does not correspond to a key in `sortMethods` using the `string` sortting method.

```
sortMethods: {
  _default: {
    method: 'string'
  },
}

```
