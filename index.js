export default {
  // maxPageSize = options.maxPageSize || 100;
  // minPageSize = options.maxPageSize ||  10;
  formatFilterQueryParams(conditions) {
    const final = {};
    for (var key in conditions) {
      final[`filter[${key}]`] = conditions[key];
    }
    return final;
  },

  run(request, modelName, schema, env) {
    console.log(this.options)
    let jobs = schema[modelName].all();
    var size = parseInt(request.queryParams['page[size]']);
    var filteredJobs = schema[modelName].where(dbItem => {
      return isFilterMatch(dbItem, searchParams);
    });
    var sortedJobs = this.sortedItems(filteredJobs, request.queryParams.sort);
    var slicedJobs = this.slicedItems(sortedJobs, request.queryParams['page[number]'], request.queryParams['page[size]']);
    let json = env.serialize(slicedJobs);
    json.links = this.paginationLinks(request.queryParams['page[number]'], request.queryParams['page[size]'], request.queryParams.sort, filteredJobs.length);
    var page_size_decrement = size - 10;
    var page_size_increment = size + 10;
    json.meta = {
      total_data_length: jobs.length,
      filtered_data_length: filteredJobs.length,
      max_page_size: this.options.maxPageSize,
      min_page_size: this.options.minPageSize,
      page_size: size,
      page_size_decrement: page_size_decrement,
      page_size_increment: page_size_increment,
      page_size_is_max: size === this.options.maxPageSize,
      page_size_is_min: size === this.options.minPageSize,
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
    if (options.this.customFilters) {
      conditions = this.options.customFilters(conditions, params, dbItem, schema);
    }

    return conditions.every(function(condition) {
      return condition === true;
    });
  },
  testing() {
    console.log('testing')
  },
  slicedItems(items, page, size = this.options.maxPageSize) {
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
    sortProp = camelize(sortProp);

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