import commonConst from "@/common/utils/commonConst";
import winSearch from "./win";

let appSearch = async () => [];

if (commonConst.windows()) {
  appSearch = winSearch;
}

export default appSearch;
