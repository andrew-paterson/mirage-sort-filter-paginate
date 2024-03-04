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

  sortedModels(request, modelName, schema) {
    let jobs = schema[modelName].all();
    const filterParams = this.extractFiltersFromQueryParams(request.queryParams);
    var filteredModels = this.filteredItems(jobs, filterParams, schema, modelName);
    return this.sortedItems(filteredModels, request.queryParams.sort, modelName);
  },

  run(request, modelName, schema, env, opts = {}) {
    let jobs = schema[modelName].all();
    const maxPageSize = this.getWithDefault('maxPageSize', modelName);
    const minPageSize = this.getWithDefault('minPageSize', modelName);
    const filterParams = this.extractFiltersFromQueryParams(request.queryParams);
    var searchParams = this.parseFilterQueryParams(filterParams, modelName);
    var filteredModels = schema[modelName].where((dbItem) => {
      return this.isFilterMatch(dbItem, searchParams, schema, modelName);
    });
    var sortedModels = this.sortedItems(filteredModels, request.queryParams.sort, modelName);
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
      total_data_length: jobs.length,
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
      // if (!(paramsItem.dbParam in dbItem)) {
      //   conditions.push(true);
      //   continue;
      // }
      const dbItemPropValue = dbItem[paramsItem.dbParam] || '';
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
        condition = dbItemPropValue.indexOf(paramsItem.value) > -1;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_lt') {
        condition = (dbItemPropValue || []).length < paramsItem.value;
        conditions.push(condition);
      } else if (filterMethod === 'array_length_gt') {
        console.log(dbItem.smartTagCloneIds);
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
        const searchItems = (paramsItem.value || '').split(',');
        searchItems.forEach((item) => {
          if (!dbItemPropValue.includes(item)) {
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

  filteredItems(jobs, params, schema, modelName) {
    var searchParams = this.parseFilterQueryParams(params, modelName);
    var filteredItems = jobs.filter((item) => {
      return this.isFilterMatch(item, searchParams, schema, modelName);
    });
    return filteredItems;
  },

  camelize(str) {
    if (!str) {
      return;
    }
    return str.replace(/-|_+(.)?/g, function (match, chr) {
      return chr ? chr.toUpperCase() : '';
    });
  },

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
    const paramsToModelMappings = this.getWithDefault('paramsToModelMappings', modelName);
    const sortMethods = this.getWithDefault('sortMethods', modelName);
    const filterMethods = this.getWithDefault('filterMethods', modelName);
    const final = {};
    for (var key in queryParams) {
      const modelProp = paramsToModelMappings[key] || key;
      if (queryParams[key]) {
        final[key] = {
          requestParam: key,
          dbParam: this.camelize(modelProp),
          sortMethod: sortMethods[modelProp] || sortMethods[camelize(modelProp)] || sortMethods._default,
          value: queryParams[key],
          filterMethod: filterMethods[key],
        };
      }
    }
    return final;
  },

  parseSortQueryParam(sortProp, modelName) {
    sortProp = sortProp.charAt(0) === '-' ? sortProp.replace('-', '') : sortProp;
    const sortMethods = this.getWithDefault('sortMethods', modelName);
    const paramsToModelMappings = this.getWithDefault('paramsToModelMappings', modelName);
    if (sortProp) {
      return {
        sortProp: sortProp,
        dbProp: paramsToModelMappings[sortProp] || camelize(sortProp),
        sortMethod: sortMethods[sortProp] || sortMethods[camelize(sortProp)] || sortMethods._default,
        value: sortProp,
      };
    }
  },

  sortedItems(items, sortProp, modelName) {
    const sortParams = this.parseSortQueryParam(sortProp, modelName);
    if (!sortProp) {
      return items;
    }
    const direction = sortProp.charAt(0) === '-' ? 'desc' : 'asc';
    if (typeof sortParams.sortMethod === 'function') {
      return sortParams.sortMethod(sortProp, direction, items, modelName);
    }
    let sortedItems;
    if (direction === 'asc') {
      sortedItems = items.sort(function (a, b) {
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
