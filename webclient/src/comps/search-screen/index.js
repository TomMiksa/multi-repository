import React, { Component } from "react";
import { Button, Card, Input, message } from "antd";
import _ from "lodash";
import axios from "axios";
import LoadingMessage from "./comps/loading-message";
import ResultColumn from "./comps/result-column";
import { fetchLinks } from "./services/fetch-links";
import { constants } from "../../constants";

const LOADING_MESSAGE_KEY = "loadingMessage";

class SearchScreen extends Component {
  state = {
    mode: "SEARCH", // one of 'SEARCH', 'FOCUS' and 'EDIT_LINKS'
    searchTerm: "Bernhard Gößwein",
    // searchTerm: "",
    resultSearchTerm: "",
    isLoading: false,
    loadingStep: -1, // -1 ... not loading at all, 0 ... first step (initial searchBothSteps in individual sources), 1 ... second step (linking)
    hoverInfo: {},
    focusInfo: {},
    linkEditInfo: {},
    nrComplete: 0,
    externalResources: undefined,
    resourcesState: undefined
  };

  componentDidMount = async () => {
    const externalResources = (await axios.get("/api/external-resources")).data;
    this.setState({ externalResources }, () => {
      const initialResources = this.getInitialResources(false);
      this.setState({ resourcesState: initialResources });
    });
  };

  getInitialResources = isLoading => {
    const { externalResources } = this.state;
    const initialResources = {};
    externalResources.forEach(externalResource => {
      _.set(
        initialResources,
        `${externalResource.platform}.${externalResource.type}`,
        { items: [], isLoading }
      );
    });
    return initialResources;
  };

  searchResource = async (platform, type, searchTerm) => {
    const messagePrefix = `[${platform} - ${type}]`;
    console.log(`\t\t${messagePrefix} searchResource...`, "start");

    const url = `/api/search-by-term/${platform}/${type}/${searchTerm}`;

    try {
      const { data } = await axios.get(url);

      if (this.state.searchFailed) {
        // if the search failed somewhere else, we don't want to update the state anymore
        console.log(
          `\t\t${messagePrefix} searchResource...`,
          "done, but already failed somewhere else."
        );
        return;
      }

      const filteredResults =
        this.state.mode !== constants.mode.EDIT_LINKS
          ? data.results
          : data.results.filter(
              r =>
                !this.state.linkEditInfo.linkedItemsIdentifiers.includes(
                  r.identifier
                )
            );

      this.setState(
        prevState => ({
          resourcesState: {
            ...prevState.resourcesState,
            [platform]: {
              ...prevState.resourcesState[platform],
              [type]: {
                items: [
                  ...prevState.resourcesState[platform][type].items, // this is [] if mode !== "EDIT_LINKS"
                  ...filteredResults.map(r => ({
                    ...r,
                    isPartOf: [],
                    resultStructure: data.resultStructure
                  }))
                ],
                isLoading: false
              }
            }
          },
          nrComplete: prevState.nrComplete + 1
        }),
        () =>
          this.updateLoadingMessage(
            this.state.mode === constants.mode.EDIT_LINKS ? 1 : 2
          )
      );

      console.log(
        `\t\t${messagePrefix} searchResource... done (${
          data.results.length
        } items found${
          this.state.mode === constants.mode.EDIT_LINKS
            ? `, ${data.results.length - filteredResults.length} filtered out`
            : ""
        })`
      );
    } catch (error) {
      const errorMessage = `\t\t${messagePrefix} searchResource... failed`;
      console.error(errorMessage);
      message.error({
        content: errorMessage,
        duration: 2.5,
        key: LOADING_MESSAGE_KEY
      });
      this.setState({ searchFailed: true });
    }
  };

  updateLoadingMessage = (nrOfSteps, loadingStep) => {
    const numberOfResources = this.getResourcesFlat().length;
    const loadingMessage = (
      <LoadingMessage
        loadingStep={loadingStep}
        nrOfSteps={nrOfSteps}
        nrComplete={this.state.nrComplete}
        nrTotal={numberOfResources}
      />
    );

    message.loading({
      content: loadingMessage,
      duration: 0,
      key: LOADING_MESSAGE_KEY
    });
  };

  getResourcesFlat = () => {
    const { externalResources, resourcesState } = this.state;
    return externalResources.map(er => ({
      ...resourcesState[er.platform][er.type],
      platform: er.platform,
      type: er.type,
      logoUrl: er.logoUrl,
      fallbackAvatar: er.fallbackAvatar
    }));
  };

  searchWithEditLinksMode = async () => {
    this.updateLoadingMessage(1);

    await this.searchStep0();

    // TODO: maybe also extract:
    const numberOfResources = this.state.externalResources.length;
    message.success({
      content: (
        <LoadingMessage
          loadingStep={-1}
          nrTotal={numberOfResources}
          nrOfSteps={1}
        />
      ),
      duration: 2.5,
      key: LOADING_MESSAGE_KEY
    });
  };

  searchWithSearchMode = async () => {
    this.updateLoadingMessage(2, 0);

    await this.searchStep0();

    this.updateLoadingMessage(2, 1);

    await this.searchStep1();

    // TODO: maybe also extract:
    const numberOfResources = this.state.externalResources.length;
    message.success({
      content: <LoadingMessage loadingStep={-1} nrTotal={numberOfResources} />,
      duration: 2.5,
      key: LOADING_MESSAGE_KEY
    });
  };

  searchStep0 = async () => {
    const { searchTerm } = this.state;
    console.log(
      `\tSearch step 0 (with searchTerm '${searchTerm}')...`,
      "start"
    );

    try {
      const resourcesFlat = this.getResourcesFlat();

      const promisesStep0 = resourcesFlat.map(r =>
        this.searchResource(r.platform, r.type, searchTerm)
      );

      await Promise.all(promisesStep0);

      console.log(
        `\tSearch step 0 (with searchTerm '${searchTerm}')...`,
        "done"
      );
    } catch (error) {
      const errorMessage = `\tSearch step 0 (with searchTerm '${searchTerm}')... failed`;
      console.error(errorMessage);
      message.error({
        content: errorMessage,
        duration: 2.5,
        key: LOADING_MESSAGE_KEY
      });
      throw new Error(error);
    }
  };

  searchStep1 = async () => {
    console.log(`\tSearch step 1...`, "start");

    this.setState({
      isLoading: false,
      loadingStep: 1
      // resultSearchTerm: searchTerm  TODO is this still needed?
    });

    try {
      await fetchLinks(this);
    } catch (error) {
      const errorMessage = `\tSearch step 1... failed`;
      console.error(errorMessage);
      message.error({
        content: errorMessage,
        duration: 2.5,
        key: LOADING_MESSAGE_KEY
      });
      throw new Error(error);
    }
    console.log(`\tSearch step 1...`, "done");
  };

  cancelDebouncedSearch = () => this.debouncedSearch.cancel();

  resetSearch = (resetSearchTerm = true, markLinkedItemsAsSticky = false) => {
    const resourcesState = this.getInitialResources(false);

    if (markLinkedItemsAsSticky) {
      this.state.externalResources.forEach(er => {
        this.state.resourcesState[er.platform][er.type].items.forEach(item => {
          if (item.isSticky) {
            resourcesState[er.platform][er.type].items.push(item);
          }
        });
      });
    }

    this.setState({
      searchTerm: resetSearchTerm ? "" : this.state.searchTerm,
      resultSearchTerm: "",
      nrComplete: 0,
      isLoading: false,
      searchFailed: false,
      resourcesState
    });
  };

  search = async () => {
    const { mode } = this.state;

    this.cancelDebouncedSearch();

    this.resetSearch(false, mode === constants.mode.EDIT_LINKS);

    console.log(`Search in mode ${mode}...`, "start");
    try {
      if (mode === constants.mode.EDIT_LINKS) {
        await this.searchWithEditLinksMode();
      } else {
        await this.searchWithSearchMode();
      }
      console.log(`Search in mode ${mode}...`, "done");
    } catch (error) {
      console.error(`Search in mode ${mode}...`, "failed");
    }
  };

  debouncedSearch = _.debounce(this.search, 1000);

  handleHoverItem = (identifier, linkIds) => {
    if (this.state.mode === constants.mode.EDIT_LINKS) {
      // avoid hovering when editing links
      return;
    }
    if (!identifier) {
      this.setState({ hoverInfo: {} });
    } else {
      this.setState({ hoverInfo: { identifier, linkIds } });
    }
  };

  handleClickItem = (identifier, linkIds) => {
    console.log("handleClickItem with", identifier);
    if (this.state.mode === "EDIT_LINKS") {
      // do nothing
    } else if (!identifier) {
      this.setState({ mode: constants.mode.SEARCH, focusInfo: {} });
    } else if (identifier === this.state.focusInfo.identifier) {
      this.setState({ mode: constants.mode.SEARCH, focusInfo: {} });
    } else {
      this.setState({
        mode: constants.mode.FOCUS,
        focusInfo: { identifier, linkIds }
      });
    }
  };

  handleLinkTagClick = (identifier, linkIds) => {
    console.log("handleLinkTagClick with", identifier);

    if (identifier === this.state.linkEditInfo.activeIdentifier) {
      this.setState({ mode: constants.mode.SEARCH, linkEditInfo: {} });
    } else {
      this.handleHoverItem(); // to reset hovering

      // mark linked items as sticky:
      const resourcesState = _.cloneDeep(this.state.resourcesState);
      const linkedItemsIdentifiers = [];
      this.state.externalResources.forEach(er => {
        resourcesState[er.platform][er.type].items.forEach(item => {
          if (linkIds.some(linkId => item.isPartOf.includes(linkId))) {
            item.isSticky = true;
            linkedItemsIdentifiers.push(item.identifier);
          }
        });
      });

      this.setState({
        mode: constants.mode.EDIT_LINKS,
        linkEditInfo: {
          activeIdentifier: identifier,
          linkIds,
          linkedItemsIdentifiers
        },
        resourcesState
      });
    }
  };

  handleRemoveLinkConfirm = identifier => {
    console.log("handleRemoveLinkConfirm", identifier);
  };

  handleAddLinkConfirm = async (event, identifier) => {
    const activeElement = this.getItemByIdentifier(
      this.state.linkEditInfo.activeIdentifier
    );
    const linkElement = this.getItemByIdentifier(identifier);

    try {
      const newLinkId = (
        await axios.post(`/api/link/`, {
          node1: {
            platform: activeElement.platform,
            type: activeElement.type,
            id: activeElement.id
          },
          node2: {
            platform: linkElement.platform,
            type: linkElement.type,
            id: linkElement.id
          }
        })
      ).data;

      const resourcesState = this.getUpdatedResourcesStateWithNewLinkId(
        [activeElement.identifier, identifier],
        newLinkId
      );

      this.setState({
        resourcesState,
        linkEditInfo: {
          ...this.state.linkEditInfo,
          linkIds: [...this.state.linkEditInfo.linkIds, newLinkId],
          linkedItemsIdentifiers: [
            ...this.state.linkEditInfo.linkedItemsIdentifiers,
            identifier
          ]
        }
      });

      message.success({
        content: "Link successfully created!",
        duration: 2.5,
        key: LOADING_MESSAGE_KEY
      });
    } catch (error) {
      message.error({
        content: "Link creation failed!",
        duration: 2.5,
        key: LOADING_MESSAGE_KEY
      });
    }
  };

  getUpdatedResourcesStateWithNewLinkId = (identifiers, newLinkId) => {
    const clonedResourcesState = _.cloneDeep(this.state.resourcesState);
    this.state.externalResources.forEach(er => {
      clonedResourcesState[er.platform][er.type].items.forEach(item => {
        if (identifiers.includes(item.identifier)) {
          item.isPartOf = [...item.isPartOf, newLinkId];
        }
      });
    });
    return clonedResourcesState;
  };

  getItemByIdentifier = identifier => {
    const snippets = identifier.split("_");
    const platform = snippets[0];
    const type = snippets[1];
    return {
      ...this.state.resourcesState[platform][type].items.filter(
        r => r.identifier === identifier
      )[0],
      platform,
      type
    };
  };

  render() {
    const {
      mode,
      externalResources,
      resourcesState,
      isLoading,
      searchTerm,
      loadingStep: fetchStep
    } = this.state;

    if (!externalResources || !resourcesState) {
      return <div>Initializing... please wait!</div>;
    }

    const resourcesFlat = this.getResourcesFlat();
    const numberOfResources = externalResources.length;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1
        }}
      >
        <Card
          onClick={() => this.setState({ mode: constants.mode.SEARCH })}
          size="small"
          style={{
            cursor: "pointer",
            position: "absolute",
            right: 0,
            borderRadius: "0.5rem",
            margin: "1.5rem",
            zIndex: 5,
            width: 260
          }}
          bodyStyle={{ height: "max-content", backgroundColor: "#E0E0E0" }}
        >
          <div>Current View:</div>
          <h1 style={{ margin: 0 }}>{this.state.mode}</h1>
          <div>
            {this.state.mode !== constants.mode.SEARCH ? (
              <small>(click to get back to SEARCH)</small>
            ) : (
              ""
            )}
          </div>
        </Card>
        <h1
          style={{
            fontWeight: "bold",
            letterSpacing: "0.45rem",
            opacity: 0.6,
            marginTop: "2rem"
          }}
        >
          MULTI REPOSITORY
        </h1>
        <div
          style={{ display: "flex", margin: "1rem", justifyContent: "center" }}
        >
          <Input.Search
            disabled={
              this.state.mode === "FOCUS" || this.state.loadingStep !== -1
            }
            style={{
              opacity:
                (this.state.mode === constants.mode.FOCUS ||
                  this.state.loadingStep !== -1) &&
                "0.25",
              width: "20rem"
            }}
            id="search"
            value={searchTerm}
            placeholder="Search for person, project,..."
            loading={isLoading}
            onChange={e => {
              if (e.target.value.length === 0) {
                this.cancelDebouncedSearch();
                this.resetSearch();
              } else {
                this.setState(
                  { searchTerm: e.target.value },
                  this.debouncedSearch
                );
              }
            }}
            onSearch={this.search}
            onPressEnter={this.search}
            onKeyDown={e => {
              if (e.key === "Escape") {
                this.cancelDebouncedSearch();
                this.resetSearch();
              }
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            margin: "1rem",
            marginTop: 0
          }}
        >
          <div style={{ display: "flex", flexDirection: "row" }}>
            {resourcesFlat.map(resource => (
              <ResultColumn
                key={`${resource.platform}_${resource.type}`}
                platform={resource.platform}
                type={resource.type}
                logoUrl={resource.logoUrl}
                fallbackAvatar={resource.fallbackAvatar}
                items={resource.items}
                isLoading={resource.isLoading}
                mode={mode}
                fetchStep={fetchStep}
                handleHoverItem={this.handleHoverItem}
                hoverInfo={this.state.hoverInfo}
                handleClickItem={this.handleClickItem}
                focusInfo={this.state.focusInfo}
                linkEditInfo={this.state.linkEditInfo}
                columnWidth={`${90 / numberOfResources}vw`}
                handleLinkTagClick={this.handleLinkTagClick}
                handleRemoveLinkConfirm={this.handleRemoveLinkConfirm}
                handleAddLinkConfirm={this.handleAddLinkConfirm}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
}

export default SearchScreen;
