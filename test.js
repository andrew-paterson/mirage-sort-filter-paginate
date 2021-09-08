import customFilters from './custom-filters';

const fieldTypes = {
  created_at: 'date',
  date_to: 'date',
  tags: 'custom',
  notTags: 'custom'
};

const fieldTypeDefault = 'string';
const maxPageSize = 10000;
const minPageSize = 10;

// function 
export default {
  formatFilterQueryParams(conditions) {
    const final = {};
    for (var key in conditions) {
      final[`filter[${key}]`] = conditions[key];
    }
    return final;
  },
  run(request, modelName, schema, env) {
    let jobs = schema[modelName].all();
    var size = parseInt(request.queryParams['page[size]']);
    var filteredJobs = this.filteredItems(jobs, request.queryParams, schema);
    var sortedJobs = this.sortedItems(filteredJobs, request.queryParams.sort);
    var slicedJobs = this.slicedItems(sortedJobs, request.queryParams['page[number]'], request.queryParams['page[size]']);
    let json = env.serialize(slicedJobs);
    json.links = this.paginationLinks(request.queryParams['page[number]'], request.queryParams['page[size]'], request.queryParams.sort, filteredJobs.length);
    var page_size_decrement = size - 10;
    var page_size_increment = size + 10;
    json.meta = {
      total_data_length: jobs.length,
      filtered_data_length: filteredJobs.length,
      max_page_size: maxPageSize,
      min_page_size: minPageSize,
      page_size: size,
      page_size_decrement: page_size_decrement,
      page_size_increment: page_size_increment,
      page_size_is_max: size === maxPageSize,
      page_size_is_min: size === minPageSize,
      total_pages: Math.ceil(filteredJobs.length/size),
    };
    return json;
  },

  paginationLinks(page, size, sort, filteredItemsLength) {
    size=parseInt(size);
    page=parseInt(page || 1);
    var maxPageNumber = Math.ceil(filteredItemsLength/size);
    if (page > maxPageNumber) {
      page = maxPageNumber;
    }
    var url = window.location.protocol + '//' + window.location.hostname + window.location.pathname;
    var secondPart = `&page[size]=${size}&sort=${sort}`;
    var paginationLinks = {};
    var firstQueryParams = encodeURI(`page[number]=1${secondPart}`);
    var lastQueryParams = encodeURI(`page[number]=${Math.ceil(filteredItemsLength/size)}${secondPart}`);
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

  isFilterMatch(dbItem, params, schema) {
    var conditions = [];
    for (var key in params) {
      let condition;
      const paramsItem = params[key];
      const fieldType = fieldTypes[paramsItem.dbParam] || fieldTypeDefault;
      const dbItemPropValue = dbItem[paramsItem.dbParam] || dbItem[this.camelize(paramsItem.dbParam)] || '';
      if (fieldType === 'date') {
        condition = key.endsWith('_from') ? moment(dbItemPropValue).isSameOrAfter(paramsItem.value, 'day') : moment(dbItemPropValue).isSameOrBefore(paramsItem.value, 'day');
        conditions.push(condition);
      } else if (fieldType === 'array') {
        condition = paramsItem.value.indexOf(dbItemPropValue) > -1;
        conditions.push(condition);
      } else if (fieldType === 'string') {
        if (paramsItem.value.indexOf('|') > -1) {
          const searchStrings = paramsItem.value.split('|');
          searchStrings.forEach(searchString => {
            let negate;
            if (searchString.startsWith('!')) {
              searchString = searchString.replace('!', '');
              negate = true;
            }
            if (dbItemPropValue.toLowerCase().indexOf(searchString.toLowerCase()) > -1) {
              condition = negate ? false : true;
            }
          })
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
    conditions = customFilters.customFilters(conditions, params, dbItem, schema);

    return conditions.every(function(condition) {
      return condition === true;
    });
  },

  slicedItems(items, page, size = maxPageSize) {
    var maxPageNumber = Math.ceil(items.length/size);
    var pageNumber = parseInt(page || 1);
    if (pageNumber > maxPageNumber) {
      pageNumber = maxPageNumber;
    }
    var pageSize = parseInt(size);
    var firstResult = pageSize * (pageNumber - 1);
    var lastResult = pageSize * pageNumber;
    return items.slice(firstResult,lastResult);
  },

  filteredItems(jobs, request, schema) {
    var searchParams = this.parseFilterQueryParams(request);
    var filteredItems = jobs.filter(item => {
      return this.isFilterMatch(item, searchParams, schema);
    });
    return filteredItems;
  },

  camelize(str) {
    if (!str) { return; }
    return str.replace(/-|_+(.)?/g, function(match, chr) {
      return chr ? chr.toUpperCase() : '';
    });
  },

  parseFilterQueryParams(queryParams) {
    const final = {};
    for (var key in queryParams) {
      const filterMatches = key.match(/filter\[(.*?)\]/);
      if (filterMatches) {
        final[filterMatches[1]] = {
          requestParam: filterMatches[1],
          dbParam: filterMatches[1].replace('_from', '_at').replace('_to', '_at'),
          value: queryParams[key]
        }
      }
    }
    return final
  },

  sortedItems(items, sortProp) {
    if (!sortProp) {
      return items;
    }
    var direction = sortProp.charAt(0) === '-' ? 'desc' : 'asc';
    sortProp = sortProp.charAt(0) === '-' ? sortProp.replace('-', '') : sortProp;

    var sortedItems;
    if (direction === 'asc') {
      sortedItems = items.sort(function(a, b){
        if (fieldTypes[sortProp] === 'date') {
          return moment(a[sortProp]).toDate() - moment(b[sortProp]).toDate();
        } else if (fieldTypes[sortProp] === 'string') {
          var textA = a[sortProp].toUpperCase();
          var textB = b[sortProp].toUpperCase();
          return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
        } else {
          return a[sortProp] - b[sortProp];
        }
      });
    } else {
      sortedItems = items.sort(function(a, b){
        if (fieldTypes[sortProp] === 'date') {
          return moment(b[sortProp]).toDate() - moment(a[sortProp]).toDate();
        } else if (fieldTypes[sortProp] === 'string') {
          var textA = a[sortProp].toUpperCase();
          var textB = b[sortProp].toUpperCase();
          return (textB < textA) ? -1 : (textB > textA) ? 1 : 0;
        }else {
          return b[sortProp] - a[sortProp];
        }
      });
    }
    return sortedItems;
  }
}