import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/blogs._index';
import {getPaginationVariables} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import type {BlogsQuery} from 'storefrontapi.generated';

type BlogNode = BlogsQuery['blogs']['nodes'][0];

export const meta: Route.MetaFunction = () => {
  return [{title: 'Blog — Victor So Professional'}];
};

export async function loader(args: Route.LoaderArgs) {
  const criticalData = await loadCriticalData(args);
  return {...criticalData};
}

async function loadCriticalData({context, request}: Route.LoaderArgs) {
  const paginationVariables = getPaginationVariables(request, {pageBy: 10});

  const [{blogs}] = await Promise.all([
    context.storefront.query(BLOGS_QUERY, {
      variables: {...paginationVariables},
    }),
  ]);

  return {blogs};
}

export default function Blogs() {
  const {blogs} = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Inicio</Link> / Blog
      </div>
      <section className="section">
        <div className="container">
          <div className="section__head">
            <h1 className="section-title-lg">Blog</h1>
          </div>
          <div className="blog-grid">
            <PaginatedResourceSection<BlogNode> connection={blogs}>
              {({node: blog}) => (
                <Link className="blog-card" key={blog.handle} prefetch="intent" to={`/blogs/${blog.handle}`}>
                  <h2>{blog.title}</h2>
                </Link>
              )}
            </PaginatedResourceSection>
          </div>
        </div>
      </section>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/blog
const BLOGS_QUERY = `#graphql
  query Blogs(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $startCursor: String
  ) @inContext(country: $country, language: $language) {
    blogs(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      nodes {
        title
        handle
        seo {
          title
          description
        }
      }
    }
  }
` as const;
