import camelize from 'lodash.camelcase';
import merge from 'lodash.merge';
import moment from 'moment';

export default {
  getWithDefault(item, modelName) {
    const defaults = {
      paramsToModelMappings: {},
      filterMethods: {},
      sortMethods: {},
      maxPageSize: 100,
      minPageSize: 10,
    };
    const options = merge({}, defaults, this.options._defaults, this.options[modelName]);
    return options[item];
  },

  allRecords(schema, modelName, preFilter) {
    let records;
    if (preFilter) {
      records = schema[modelName].where(preFilter);
    } else {
      records = schema[modelName].all();
    }
    return records;
  },

  sortedModels(request, modelName, schema, opts = {}) {
    let records = this.allRecords(schema, modelName, opts.preFilter);
    const filterParams = this.extractFiltersFromQueryParams(request.queryParams);
    var filteredModels = this.filteredItems(records, filterParams, schema, modelName);
    return this.sortedItems(filteredModels, request.queryParams.sort, modelName);
  },

  run(request, modelName, schema, env, opts = {}) {
    let records = this.allRecords(schema, modelName, opts.preFilter);
    const maxPageSize = this.getWithDefault('maxPageSize', modelName);
    const minPageSize = this.getWithDefault('minPageSize', modelName);
    const filterParams = this.extractFiltersFromQueryParams(request.queryParams);
    var searchParams = this.parseFilterQueryParams(filterParams, modelName);
    var filteredModels = records.filter((dbItem) => {
      // Mirage specific filter function
      return this.isFilterMatch(dbItem, searchParams, schema, modelName);
    });
    var sortedModels = this.sortedItems(filteredModels, request.queryParams.sort, modelName, opts);
    const qpSize = parseInt(request.queryParams['page[size]'] || maxPageSize);
    let size;
    if (qpSize > maxPageSize) {
      size = maxPageSize;
    } else if (qpSize < minPageSize) {
      size = minPageSize;
    } else {
      size = qpSize;
    }
    const totalPages = Math.ceil(filteredModels.length / size);
    const qpNumber = parseInt(request.queryParams['page[number]'] || '1');
    let number;
    if (qpNumber > totalPages) {
      number = totalPages;
    } else if (qpNumber < 1) {
      number = 1;
    } else {
      number = qpNumber;
    }
    var slicedModels = this.slicedItems(sortedModels, number, size, modelName);
    let json = env.serialize(slicedModels);
    json.links = this.paginationLinks(number, size, request.queryParams.sort, filteredModels.length);
    var page_size_decrement = size - 10;
    var page_size_increment = size + 10;
    json.meta = {
      total_data_length: records.length,
      filtered_data_length: filteredModels.length,
      max_page_size: this.getWithDefault('maxPageSize', modelName),
      min_page_size: this.getWithDefault('minPageSize', modelName),
      page_size: size,
      page_size_decrement: page_size_decrement,
      page_size_increment: page_size_increment,
      page_size_is_max: size === this.getWithDefault('maxPageSize', modelName),
      page_size_is_min: size === this.getWithDefault('minPageSize', modelName),
      total_pages: totalPages,
    };
    if (opts.customMetaTransforms) {
      opts.customMetaTransforms(json.meta, filteredModels, sortedModels, slicedModels);
    }
    return json;
  },

  paginationLinks(page, size, sort, filteredItemsLength) {
    size = parseInt(size);
    page = parseInt(page || 1);
    var maxPageNumber = Math.ceil(filteredItemsLength / size);
    if (page > maxPageNumber) {
      page = maxPageNumber;
    }
    var url = window.location.protocol + '//' + window.location.hostname + window.location.pathname;
    var secondPart = `&page[size]=${size}&sort=${sort}`;
    var paginationLinks = {};
    var firstQueryParams = encodeURI(`page[number]=1${secondPart}`);
    var lastQueryParams = encodeURI(`page[number]=${Math.ceil(filteredItemsLength / size)}${secondPart}`);
    var selfQueryParams = encodeURI(`page[number]=${page}${secondPart}`);
    var prevQueryParams = encodeURI(`page[number]=${page - 1}${secondPart}`);
    var nextQueryParams = encodeURI(`page[number]=${page + 1}${secondPart}`);
    paginationLinks.last = `${url}?${lastQueryParams}`;
    paginationLinks.first = `${url}?${firstQueryParams}`;
    paginationLinks.self = `${url}?${selfQueryParams}`;
    if (page > 1) {
      paginationLinks.prev = `${url}?${prevQueryParams}`;
    }
    if (paginationLinks.self !== paginationLinks.last) {
      paginationLinks.next = `${url}?${nextQueryParams}`;
    }
    return paginationLinks;
  },

  isFilterMatch(dbItem, params, schema, modelName) {
    var conditions = [];
    for (var key in params) {
      let condition;
      const paramsItem = params[key];
      const filterMethod = paramsItem.filterMethod;
      if (typeof filterMethod === 'function') {
        condition = filterMethod(dbItem, params, schema, modelName);
        conditions.push(condition);
        continue;
      }
      const dbItemPropValue = dbItem[paramsItem.dbProp] || '';
      if (filterMethod === 'date_gt') {
        condition = moment(dbItemPropValue).isAfter(paramsItem.value, 'day');
        conditions.push(condition);
      } else if (filterMethod === 'date_lt') {
        condition = moment(dbItemPropValue).isBefore(paramsItem.value, 'day');
        conditions.push(condition);
      } else if (filterMethod === 'date_gte') {
        condition = moment(dbItemPropValue).isSameOrAfter(paramsItem.value, 'day');
        conditions.push(condition);
      } else if (filterMethod === 'date_lte') {
        condition = moment(dbItemPropValue).isSameOrBefore(paramsItem.value, 'day');
        conditions.push(condition);
      } else if (filterMethod === 'gt') {
        condition = dbItemPropValue > paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'lt') {
        condition = dbItemPropValue < paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'gte') {
        condition = dbItemPropValue >= paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'lte') {
        condition = dbItemPropValue <= paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_includes') {
        // The DB prop is an array and the query param value is a primitive
        condition = dbItemPropValue.indexOf(paramsItem.value) > -1;
        conditions.push(condition);
      } else if (filterMethod === 'in_array') {
        // The DB prop is a primitive and the query param value is an array
        const searchItems = Array.isArray(paramsItem.value) ? paramsItem.value : (paramsItem.value || '').split(',');
        condition = searchItems.indexOf(dbItemPropValue) > -1;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_lt') {
        condition = (dbItemPropValue || []).length < paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_gt') {
        condition = (dbItemPropValue || []).length > paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_lte') {
        condition = (dbItemPropValue || []).length <= paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_gte') {
        condition = (dbItemPropValue || []).length >= paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_intersection') {
        condition = true;
        const searchItems = Array.isArray(paramsItem.value) ? paramsItem.value : (paramsItem.value || '').split(',');
        searchItems.forEach((item) => {
          if (!searchItems.includes(item)) {
            condition = false;
          }
        });
        conditions.push(condition);
      } else if (filterMethod === 'string') {
        if (paramsItem.value.indexOf('|') > -1 || paramsItem.value.match(/\r?\n/)) {
          const searchStrings = paramsItem.value.split(/\||\r?\n/);
          searchStrings.forEach((searchString) => {
            let negate;
            if (searchString.startsWith('!')) {
              searchString = searchString.replace('!', '');
              negate = true;
            }
            if (dbItemPropValue.toLowerCase().indexOf(searchString.toLowerCase()) > -1) {
              condition = negate ? false : true;
            }
          });
        } else {
          let searchString = paramsItem.value;
          let negate;
          if (searchString.startsWith('!')) {
            searchString = searchString.replace('!', '');
            negate = true;
          }
          if (negate) {
            condition = dbItemPropValue.toLowerCase().indexOf(searchString.toLowerCase()) < 0;
          } else {
            condition = dbItemPropValue.toLowerCase().indexOf(searchString.toLowerCase()) > -1;
          }
        }
        conditions.push(condition);
      }
    }
    if (this.options[modelName] && this.options[modelName].customFilters) {
      const customFiltersFunc = this.options[modelName].customFilters;
      const customFilterConditions = customFiltersFunc(params, dbItem, schema);
      conditions = conditions.concat(customFilterConditions);
    }

    return conditions.every((condition) => {
      return condition === true;
    });
  },

  slicedItems(items, page, size, modelName) {
    size = size || this.getWithDefault('maxPageSize', modelName);
    var maxPageNumber = Math.ceil(items.length / size);
    var pageNumber = page;
    if (pageNumber > maxPageNumber) {
      pageNumber = maxPageNumber;
    }
    var pageSize = size;
    var firstResult = pageSize * (pageNumber - 1);
    var lastResult = pageSize * pageNumber;
    return items.slice(firstResult, lastResult);
  },

  filteredItems(records, params, schema, modelName) {
    var searchParams = this.parseFilterQueryParams(params, modelName);
    var filteredItems = records.filter((item) => {
      return this.isFilterMatch(item, searchParams, schema, modelName);
    });
    return filteredItems;
  },

  // camelize(str) {
  //   if (!str) {
  //     return;
  //   }
  //   return str.replace(/-|_+(.)?/g, function (match, chr) {
  //     return chr ? chr.toUpperCase() : '';
  //   });
  // },

  extractFiltersFromQueryParams(queryParams) {
    const final = {};
    for (var key in queryParams) {
      const filterMatches = key.match(/filter\[(.*?)\]/);
      if (filterMatches && queryParams[key]) {
        final[filterMatches[1]] = queryParams[key];
      }
    }
    return final;
  },

  parseFilterQueryParams(queryParams, modelName) {
    const filterMethods = this.getWithDefault('filterMethods', modelName);
    const final = {};
    for (var key in queryParams) {
      const filterMethodObj = filterMethods[key] || filterMethods._default;
      if (!filterMethodObj) {
        continue;
      }
      filterMethodObj.dbProp = filterMethodObj.dbProp || camelize(key);
      if (queryParams[key]) {
        final[key] = {
          requestParam: key,
          dbProp: filterMethodObj.dbProp,
          value: queryParams[key],
          filterMethod: filterMethodObj.method,
        };
      }
    }
    return final;
  },

  parseSortQueryParam(sortProp, modelName) {
    sortProp = sortProp.charAt(0) === '-' ? sortProp.replace('-', '') : sortProp;
    const sortMethods = this.getWithDefault('sortMethods', modelName);
    const sortMethodObj = sortMethods[sortProp] || sortMethods._default;
    if (!sortMethodObj) {
      return;
    }
    sortMethodObj.dbProp = sortMethodObj.dbProp || camelize(sortProp);
    if (sortProp) {
      return {
        sortProp: sortProp,
        dbProp: sortMethodObj.dbProp,
        value: sortProp,
        sortMethod: sortMethodObj.method,
      };
    }
  },

  sortedItems(items, sortProp, modelName) {
    if (!sortProp) {
      return items;
    }
    const sortParams = this.parseSortQueryParam(sortProp, modelName);
    const direction = sortProp.charAt(0) === '-' ? 'desc' : 'asc';
    if (typeof sortParams.sortMethod === 'function') {
      return sortParams.sortMethod(sortProp, direction, items, modelName);
    }
    let sortedItems;
    if (direction === 'asc') {
      sortedItems = items.sort(function (a, b) {
        // Mirage specific sort function
        if (sortParams.sortMethod === 'date') {
          return moment(a[sortParams.dbProp]).toDate() - moment(b[sortParams.dbProp]).toDate();
        } else if (sortParams.sortMethod === 'number') {
          return a[sortParams.dbProp] - b[sortParams.dbProp];
        } else if (sortParams.sortMethod === 'array_length') {
          return (a[sortParams.dbProp] || []).length - (b[sortParams.dbProp] || []).length;
        } else {
          var textA = a[sortParams.dbProp].toUpperCase();
          var textB = b[sortParams.dbProp].toUpperCase();
          return textA < textB ? -1 : textA > textB ? 1 : 0;
        }
      });
    } else {
      sortedItems = items.sort(function (a, b) {
        // Mirage specific sort function
        if (sortParams.sortMethod === 'date') {
          return moment(b[sortParams.dbProp]).toDate() - moment(a[sortParams.dbProp]).toDate();
        } else if (sortParams.sortMethod === 'number') {
          return b[sortParams.dbProp] - a[sortParams.dbProp];
        } else if (sortParams.sortMethod === 'array_length') {
          return (b[sortParams.dbProp] || []).length - (a[sortParams.dbProp] || []).length;
        } else {
          var textA = a[sortParams.dbProp].toUpperCase();
          var textB = b[sortParams.dbProp].toUpperCase();
          return textB < textA ? -1 : textB > textA ? 1 : 0;
        }
      });
    }
    return sortedItems;
  },
};
