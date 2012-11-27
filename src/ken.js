// Ken
// -----------------
// 
// A Visual Knowledge Browser

var Ken = {};

// Colors
// ------------

Ken.COLOR_PALETTES = {
  "greenish": ["#afc59c", "#bcc97b", "#d8c46f"],
  "blueish": ["#a377b8", "#6c6db4", "#6c9db4"],
  "redish": ["#e3ae78", "#df8682", "#cb829b"]
};

// Ken.Session
// -----------------

Ken.Session = function(collection) {
  // The original collection
  this.collection = collection;
  this.filteredCollection = collection;

  this.filterValueCount = 0;
  this.filters = {};
  this.matches = {};

  this.colors = new ColorPool(Ken.COLOR_PALETTES);

  this.initValueMap();
};

_.extend(Ken.Session.prototype, _.Events, {

  addFilter: function(property, value) {
    if (!this.filters[property]) this.filters[property] = {};
    this.filters[property][value] = {
      color: this.colors.getNext()
    };
    this.filterValueCount += 1;
    this.filter();
  },

  removeFilter: function(property, value) {
    delete this.filters[property][value];
    this.filterValueCount -= 1;
    this.filter();
  },

  // Compute collection based on filters
  filter: function() {
    var that = this;

    // Reset matches
    this.matches = {};

    function flattenFilters() {
      var filters = [];
      _.each(that.filters, function(f, key) {
        _.each(f, function(bla, val) {
          filters.push({
            property: key,
            value: val
          });
        });
      });
      return filters;
    }

    function registerMatch(o, filter) {
      var obj = that.matches[o._id];
      if (!obj) obj = that.matches[o._id] = [];
      obj.push(filter);
    }

    var filters = flattenFilters();

    // Join 'em together
    if (filters.length > 0) {
      this.filteredCollection = new Data.Collection({
        "type": {
          "_id": this.collection.type._id,
          "name": this.collection.type.name,
          "properties": this.collection.type.properties,
        },
        "objects": []
      });
      _.each(filters, function(f) {
        var objects = this.valueMap[f.property][f.value];
        _.each(objects, function(o) {
          registerMatch(o, [f.property, f.value]);

          if (!this.filteredCollection.get(o._id)) this.filteredCollection.add(o);
        }, this);
      }, this);
    } else {
      this.filteredCollection = this.collection;
    }
    console.log('matches', this.matches);
    this.trigger('data:changed');
  },

  // getMatchesForObject: function(o) {
  //   var that = this;
  //   var matches = [];
  //   _.each(this.filters, function(values, property) {
  //     _.each(values, function(color, value) {
  //       if (_.include(that.valueMap[property][value], o)) {
  //         matches.push(color);
  //       }
  //     });
  //   });

  //   console.log('color');
  // },

  getMatchesForObject: function(o) {
    var that = this;
    return _.map(this.matches[o._id], function(filter) {
      return that.filters[filter[0]][filter[1]];
    });
  },

  // Based on current filter criteria, get facets
  getFacets: function() {
    var that = this;
    var facets = {};

    _.each(this.collection.type.properties, function(p, key) {
      if (!p.meta || !p.meta.facet) return;

      function getRelatedObjects(property, value) {
        var objects = [];
        _.each(that.valueMap[property][value], function(o) {
          if (that.filteredCollection.get(o._id)) objects.push(o);
        });
        return objects;
      }

      function getAvailableValues() {
        // Extract available values
        var values = [];
        _.each(that.valueMap[key], function(objects, value) {
          if (that.filters[key] && that.filters[key][value]) return;
          values.push({
            val: value,
            objects: objects,
            relatedObjects: getRelatedObjects(key, value)
          });
        });
        return values;
      }

      function getSelectedValues() {
        var values = [];
        _.each(that.filters[key], function(filter, val) {
          values.push({
            val: val,
            objects: that.valueMap[key][val],
            relatedObjects: getRelatedObjects(key, val),
            color: filter.color
          });
        });
        return values;
      }

      // Find max object count
      var availableValues = getAvailableValues();
      var selectedValues  = getSelectedValues();
      var maxCount = Math.max.apply(this, _.map(availableValues.concat(selectedValues), function(v) {
        return v.objects.length
      }));

      // Sort functions
      var VALUES_BY_RELEVANCE = function(item1, item2) {
        var i1 = item1.relatedObjects.length;
        var i2 = item2.relatedObjects.length;

        return i1 === i2 ? 0 : (i1 > i2 ? -1 : 1);
      };
      
      var VALUES_BY_FREQUENCY = function(item1, item2) {
        var i1 = item1.objects.length;
        var i2 = item2.objects.length;

        return i1 === i2 ? 0 : (i1 > i2 ? -1 : 1);
      };

      var VALUES_BY_RELEVANCE_AND_FREQUENCY = function(item1, item2) {
        var byRelevance = VALUES_BY_RELEVANCE(item1, item2);
        if (byRelevance !== 0) return byRelevance;
        return VALUES_BY_FREQUENCY(item1, item2);
      };


      availableValues = availableValues.sort(VALUES_BY_RELEVANCE_AND_FREQUENCY);
      selectedValues = selectedValues.sort(VALUES_BY_RELEVANCE_AND_FREQUENCY);


      facets[key] = {
        property: p,
        name: p.name,
        availableValues: availableValues,
        selectedValues: selectedValues,
        values: [],
        maxObjectCount: maxCount,
        scale: function(count) {
          return count*60/maxCount; // pixel space = 60px
        }
      };
    });
    return facets;
  },

  initValueMap: function() {
    var that = this;

    this.valueMap = {};

    function extractValues(key) {
      var values = {};

      function registerVal(val, o) {
        if (values[val]) {
          values[val].push(o);
        } else {
          values[val] = [o];
        }
      }

      _.each(that.collection.objects, function(o) {
        var vals = o.properties[key];
        vals = _.isArray(vals) ? vals : [ vals ];
        
        _.each(vals, function(v) {
          registerVal(v, o);
        });
      });
      return values;
    }

    _.each(this.collection.type.properties, function(p, key) {
      that.valueMap[key] = extractValues(key);
    }, this);
  }
});



// Ken.Matrix
// -----------------
// 
// Matrix Plot

Ken.Matrix = Backbone.View.extend({
  events: {

  },

  update: function() {
    this.render();
  },

  render: function() {
    // Empty container
    this.$el.empty();
    _.each(this.model.filteredCollection.objects, function(item) {
      var html = _.tpl('item', {
        item: item,
        matches: this.model.getMatchesForObject(item)
      });

      this.$el.append(html);
    }, this);
    return this;
  }
});


// Ken.Facets
// -----------------

Ken.Facets = Backbone.View.extend({
  events: {
    'click a.value.add': 'addValue',
    'click a.value.remove': 'removeValue'
  },
  
  // Set a new filter
  addValue: function(e) {
    var property = $(e.currentTarget).attr('data-property'),
        value = $(e.currentTarget).attr('data-value');

    this.model.addFilter(property, value);
    return false;
  },
  
  // Set a new filter
  removeValue: function(e) {
    var property = $(e.currentTarget).attr('data-property'),
        value = $(e.currentTarget).attr('data-value');

    this.model.removeFilter(property, value);

    return false;
  },

  initialize: function(options) {

  },
  
  render: function() {
    $(this.el).html(_.tpl('facets', {
      filters: this.model.filters,
      facets: this.model.getFacets()
    }));

    return this;
  }
});


// Ken.Browser
// -------------------

Ken.Browser = Backbone.View.extend({
  events: {

  },
  
  initialize: function(options) {
    this.model.bind('data:changed', this.update, this);
  },
  
  // Update plot and facets
  update: function() {
    this.matrix.update();
    this.facets.render();
  },
  
  render: function() {
    // Should be rendered just once
    $(this.el).html(_.tpl('browser', {}));

    this.facets = new Ken.Facets({model: this.model, el: this.$('#facets')});

    this.matrix = new Ken.Matrix({model: this.model, el: this.$('#matrix')});
      
    // Initially render the facets
    this.facets.render();

    // Initially render the matrix
    this.matrix.render();

    return this;
  }
});